import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCommunityExists } from "../_shared/x-community-validator.ts";
import { alertAndLogCommunityDeletion, CommunityAlertInfo } from "../_shared/x-community-alerts.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface XCommunityData {
  communityId: string;
  name?: string;
  description?: string;
  memberCount?: number;
  adminUsernames: string[];
  moderatorUsernames: string[];
  rawData?: any;
}

// Detect if a Twitter URL is an X Community
function detectTwitterType(url: string): 'account' | 'community' | null {
  if (!url) return null;
  if (url.includes('/i/communities/') || url.includes('communities/')) {
    return 'community';
  }
  if (url.includes('x.com/') || url.includes('twitter.com/')) {
    const username = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i)?.[1];
    if (username && !['i', 'home', 'search', 'explore', 'notifications', 'messages', 'settings'].includes(username.toLowerCase())) {
      return 'account';
    }
  }
  return null;
}

// Extract community ID from URL
function extractCommunityId(url: string): string | null {
  const match = url.match(/communities\/(\d+)/);
  return match ? match[1] : null;
}

// Extract username from Twitter URL
function extractTwitterUsername(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i);
  if (match && !['i', 'home', 'search', 'explore'].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return null;
}

interface FetchResult {
  admins: string[];
  moderators: string[];
  memberCount?: number;
  name?: string;
  description?: string;
  httpStatus: number;
  errorBody?: string;
  rawData?: any;
}

/**
 * Fetch X Community staff via Firecrawl (replaces Apify actor)
 * Scrapes the community About tab and parses admin/mod handles from markdown
 */
async function fetchCommunityViaFirecrawl(communityId: string, firecrawlApiKey: string): Promise<FetchResult> {
  const { createApiLogger } = await import("../_shared/api-logger.ts");
  const logger = createApiLogger({
    serviceName: 'firecrawl',
    endpoint: 'v1/scrape',
    method: 'POST',
    functionName: 'x-community-enricher',
    metadata: { communityId },
  });

  try {
    const communityUrl = `https://x.com/i/communities/${communityId}`;
    console.log(`[Firecrawl] Scraping X Community About page: ${communityUrl}`);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: communityUrl,
        formats: ['markdown', 'links'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for JS to render community page
      }),
    });

    await logger.complete(response.status);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[Firecrawl] HTTP ${response.status} for community ${communityId}: ${errorBody.slice(0, 200)}`);
      return { admins: [], moderators: [], httpStatus: response.status, errorBody: errorBody.slice(0, 300) };
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || data?.markdown || '';
    const metadata = data?.data?.metadata || data?.metadata || {};

    if (!markdown || markdown.length < 50) {
      console.warn(`[Firecrawl] Empty or too short markdown for community ${communityId}`);
      return { admins: [], moderators: [], httpStatus: response.status, errorBody: 'Empty markdown response' };
    }

    // Parse the markdown for admin/mod handles
    const parsed = parseXCommunityMarkdown(markdown);

    console.log(`[Firecrawl] Community ${communityId}: ${parsed.admins.length} admins, ${parsed.moderators.length} mods found`);

    return {
      admins: parsed.admins,
      moderators: parsed.moderators,
      memberCount: parsed.memberCount,
      name: parsed.name || metadata?.title,
      description: parsed.description,
      httpStatus: response.status,
      rawData: { markdown: markdown.slice(0, 2000), parsedAt: new Date().toISOString() },
    };
  } catch (error) {
    await logger.fail(error instanceof Error ? error.message : String(error));
    console.error('[Firecrawl] Failed to fetch community:', error);
    return { admins: [], moderators: [], httpStatus: 0, errorBody: String(error) };
  }
}

/**
 * Parse X Community page markdown to extract admin/mod handles
 * 
 * X Community pages typically show:
 * - Community name as heading
 * - Member count
 * - "Admin" section with @handles or profile links
 * - "Moderator" or "Moderators" section with @handles or profile links
 */
function parseXCommunityMarkdown(markdown: string): {
  admins: string[];
  moderators: string[];
  memberCount?: number;
  name?: string;
  description?: string;
} {
  const admins: string[] = [];
  const moderators: string[] = [];
  let memberCount: number | undefined;
  let name: string | undefined;
  let description: string | undefined;

  // Extract community name from first heading
  const nameMatch = markdown.match(/^#\s+(.+)$/m);
  if (nameMatch) name = nameMatch[1].trim();

  // Extract member count (various formats)
  const memberPatterns = [
    /(\d[\d,.]+)\s*(?:Members?|members?)/i,
    /Members?\s*[:\-]\s*(\d[\d,.]+)/i,
  ];
  for (const pattern of memberPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      memberCount = parseInt(match[1].replace(/[,.]/g, ''), 10);
      break;
    }
  }

  // Helper: extract @handles from a text section
  function extractHandles(text: string): string[] {
    const handles: string[] = [];
    // Match @username patterns
    const atMatches = text.matchAll(/@([A-Za-z0-9_]{1,15})/g);
    for (const m of atMatches) handles.push(m[1].toLowerCase());
    // Match x.com/username or twitter.com/username links
    const linkMatches = text.matchAll(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/gi);
    for (const m of linkMatches) {
      const u = m[1].toLowerCase();
      if (!['i', 'home', 'search', 'explore', 'communities'].includes(u) && !handles.includes(u)) {
        handles.push(u);
      }
    }
    return [...new Set(handles)];
  }

  // Split markdown into lines for section-based parsing
  const lines = markdown.split('\n');
  let currentSection: 'none' | 'admin' | 'moderator' = 'none';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();

    // Detect section headers
    if (/admin/i.test(lower) && (lower.startsWith('#') || lower.startsWith('**') || lower.endsWith(':'))) {
      currentSection = 'admin';
      // Check if handles are on the same line
      const sameLineHandles = extractHandles(line);
      admins.push(...sameLineHandles);
      continue;
    }
    if (/moderator/i.test(lower) && (lower.startsWith('#') || lower.startsWith('**') || lower.endsWith(':'))) {
      currentSection = 'moderator';
      const sameLineHandles = extractHandles(line);
      moderators.push(...sameLineHandles);
      continue;
    }
    // A new non-admin/mod section header resets
    if ((lower.startsWith('#') || lower.startsWith('**')) && !/admin|moderator|mod/i.test(lower)) {
      if (currentSection !== 'none') currentSection = 'none';
      continue;
    }

    // Extract handles from current section
    if (currentSection === 'admin') {
      admins.push(...extractHandles(line));
    } else if (currentSection === 'moderator') {
      moderators.push(...extractHandles(line));
    }
  }

  // Fallback: if section parsing found nothing, try global regex for "Admin: @handle" patterns
  if (admins.length === 0 && moderators.length === 0) {
    const adminLineMatch = markdown.match(/Admin[s]?\s*[:\-]\s*(.+)/gi);
    if (adminLineMatch) {
      for (const line of adminLineMatch) admins.push(...extractHandles(line));
    }
    const modLineMatch = markdown.match(/Moderator[s]?\s*[:\-]\s*(.+)/gi);
    if (modLineMatch) {
      for (const line of modLineMatch) moderators.push(...extractHandles(line));
    }
  }

  return {
    admins: [...new Set(admins)],
    moderators: [...new Set(moderators)],
    memberCount,
    name,
    description,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if community enricher is enabled
    const { data: monitorConfig } = await supabase
      .from('pumpfun_monitor_config')
      .select('community_enricher_is_enabled')
      .limit(1)
      .single();

    if (monitorConfig && monitorConfig.community_enricher_is_enabled === false) {
      console.log('[x-community-enricher] Service is disabled via admin toggle');
      return new Response(
        JSON.stringify({ error: 'X Community Enricher is currently disabled by admin', disabled: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      communityUrl, 
      twitterUrl, // Can be either account or community
      linkedTokenMint,
      linkedWallet,
      triggerTeamDetection = true
    } = await req.json();

    const urlToProcess = communityUrl || twitterUrl;
    if (!urlToProcess) {
      return new Response(
        JSON.stringify({ error: "communityUrl or twitterUrl required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const twitterType = detectTwitterType(urlToProcess);
    console.log(`Processing Twitter URL: ${urlToProcess}, type: ${twitterType}`);

    if (twitterType === 'account') {
      // Regular X account - extract username and enrich via twitter-profile-enricher
      const username = extractTwitterUsername(urlToProcess);
      if (username) {
        // Trigger twitter profile enricher
        const { data: enrichData } = await supabase.functions.invoke('twitter-profile-enricher', {
          body: { usernames: [username] }
        });
        
        return new Response(JSON.stringify({
          success: true,
          type: 'account',
          username,
          enrichmentResult: enrichData
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (twitterType === 'community') {
      const communityId = extractCommunityId(urlToProcess);
      
      if (!communityId) {
        return new Response(
          JSON.stringify({ error: "Could not extract community ID from URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if we have a recent scrape
      const { data: existingCommunity } = await supabase
        .from('x_communities')
        .select('*')
        .eq('community_id', communityId)
        .single();

      // Skip communities with 3+ consecutive failures (likely deleted/private)
      const failCount = existingCommunity?.failed_scrape_count || 0;
      if (failCount >= 3) {
        console.log(`[x-community-enricher] Skipping community ${communityId} - ${failCount} consecutive failures (likely deleted/private)`);
        return new Response(JSON.stringify({
          success: false,
          type: 'community',
          communityId,
          skipped: true,
          reason: `Skipped after ${failCount} consecutive Apify failures. Community likely deleted or private.`,
          failCount,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const needsScrape = !existingCommunity || 
        !existingCommunity.last_scraped_at ||
        new Date(existingCommunity.last_scraped_at).getTime() < Date.now() - 24 * 60 * 60 * 1000; // 24h cache

      let communityData: XCommunityData = {
        communityId,
        adminUsernames: existingCommunity?.admin_usernames || [],
        moderatorUsernames: existingCommunity?.moderator_usernames || []
      };

      if (needsScrape && apifyApiKey) {
        console.log('Fetching fresh community data from Apify...');
        const fetchResult = await fetchCommunityMembers(communityId, apifyApiKey);
        const members = fetchResult.members;
        
        // If Apify returned an error (400/500), track the failure and stop
        if (fetchResult.httpStatus >= 400 || (fetchResult.httpStatus === 0 && fetchResult.errorBody)) {
          const newFailCount = (existingCommunity?.failed_scrape_count || 0) + 1;
          console.warn(`[x-community-enricher] Apify ${fetchResult.httpStatus} for community ${communityId} (fail #${newFailCount}): ${fetchResult.errorBody?.slice(0, 100)}`);
          
          // Update fail count and set last_scraped_at to prevent immediate retry
          await supabase.from('x_communities').upsert({
            community_id: communityId,
            community_url: urlToProcess,
            failed_scrape_count: newFailCount,
            scrape_status: `error_${fetchResult.httpStatus}`,
            last_scraped_at: new Date().toISOString(), // Prevents retry for 24h
            updated_at: new Date().toISOString(),
          }, { onConflict: 'community_id' });
          
          return new Response(JSON.stringify({
            success: false,
            type: 'community',
            communityId,
            error: `Apify returned ${fetchResult.httpStatus}`,
            failCount: newFailCount,
            willRetryAfter: newFailCount >= 3 ? 'never (max failures reached)' : '24h',
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        // Validate if community still exists
        const existenceCheck = await validateCommunityExists(communityId, members);
        
        if (existenceCheck.isDeleted) {
          console.warn(`[X Community Enricher] Community ${communityId} appears DELETED`);
          
          const newFailCount = (existingCommunity?.failed_scrape_count || 0) + 1;
          await supabase.from('x_communities').update({
            is_deleted: true,
            deleted_detected_at: new Date().toISOString(),
            scrape_status: 'deleted',
            failed_scrape_count: newFailCount,
            last_existence_check_at: new Date().toISOString(),
            last_scraped_at: new Date().toISOString(),
          }).eq('community_id', communityId);
          
          if (!existingCommunity?.deletion_alert_sent) {
            const alertInfo: CommunityAlertInfo = {
              communityId,
              communityUrl: urlToProcess,
              communityName: existingCommunity?.name,
              linkedTokens: linkedTokenMint ? [linkedTokenMint, ...(existingCommunity?.linked_token_mints || [])] : (existingCommunity?.linked_token_mints || []),
              adminUsernames: existingCommunity?.admin_usernames || [],
              moderatorUsernames: existingCommunity?.moderator_usernames || [],
              memberCount: existingCommunity?.member_count,
              detectedAt: new Date().toISOString(),
            };
            
            const { alerted } = await alertAndLogCommunityDeletion(supabase, alertInfo);
            
            if (alerted) {
              await supabase.from('x_communities').update({
                deletion_alert_sent: true,
              }).eq('community_id', communityId);
            }
          }
          
          return new Response(JSON.stringify({
            success: true,
            type: 'community',
            communityId,
            isDeleted: true,
            message: 'Community has been deleted by its owners'
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        if (members.length > 0) {
          communityData = await processCommunityData(members);
          communityData.communityId = communityId;
          
          // Reset fail count on successful scrape
          if (existingCommunity?.failed_scrape_count > 0) {
            await supabase.from('x_communities').update({
              failed_scrape_count: 0,
            }).eq('community_id', communityId);
          }
        }
      } else if (needsScrape && !apifyApiKey) {
        console.warn('APIFY_API_KEY not configured, skipping scrape');
      }

      // Build linked arrays
      const linkedTokenMints = existingCommunity?.linked_token_mints || [];
      const linkedWallets = existingCommunity?.linked_wallets || [];
      
      if (linkedTokenMint && !linkedTokenMints.includes(linkedTokenMint)) {
        linkedTokenMints.push(linkedTokenMint);
      }
      if (linkedWallet && !linkedWallets.includes(linkedWallet)) {
        linkedWallets.push(linkedWallet);
      }

      // Upsert community data
      const { error: upsertError } = await supabase.from('x_communities').upsert({
        community_id: communityId,
        community_url: urlToProcess,
        admin_usernames: communityData.adminUsernames,
        moderator_usernames: communityData.moderatorUsernames,
        member_count: communityData.memberCount,
        linked_token_mints: linkedTokenMints,
        linked_wallets: linkedWallets,
        last_scraped_at: needsScrape && apifyApiKey ? new Date().toISOString() : existingCommunity?.last_scraped_at,
        scrape_status: needsScrape && apifyApiKey ? 'complete' : existingCommunity?.scrape_status,
        raw_data: communityData.rawData || existingCommunity?.raw_data
      }, { onConflict: 'community_id' });

      if (upsertError) {
        console.error('Failed to upsert community:', upsertError);
      }

      // Cross-reference admins/mods with blacklist
      const allUsernames = [...communityData.adminUsernames, ...communityData.moderatorUsernames];
      let blacklistedUsers: string[] = [];
      let whitelistedUsers: string[] = [];

      if (allUsernames.length > 0) {
        const { data: blacklistMatches } = await supabase
          .from('pumpfun_blacklist')
          .select('identifier, risk_level')
          .in('identifier', allUsernames)
          .eq('entry_type', 'twitter_account')
          .eq('is_active', true);

        if (blacklistMatches) {
          blacklistedUsers = blacklistMatches.map(m => m.identifier);
        }

        const { data: whitelistMatches } = await supabase
          .from('pumpfun_whitelist')
          .select('identifier')
          .in('identifier', allUsernames)
          .eq('entry_type', 'twitter_account')
          .eq('is_active', true);

        if (whitelistMatches) {
          whitelistedUsers = whitelistMatches.map(m => m.identifier);
        }
      }

      // === CREATE REPUTATION MESH LINKS ===
      const meshLinks: any[] = [];
      const now = new Date().toISOString();

      // Admin links: X account → admin_of → X community
      for (const admin of communityData.adminUsernames) {
        meshLinks.push({
          source_type: 'x_account',
          source_id: admin.toLowerCase(),
          linked_type: 'x_community',
          linked_id: communityId,
          relationship: 'admin_of',
           confidence: 100,
           discovered_via: 'x_community_enricher',
           evidence: { scraped_at: now }
        });
      }

      // Mod links: X account → mod_of → X community
      for (const mod of communityData.moderatorUsernames) {
        meshLinks.push({
          source_type: 'x_account',
          source_id: mod.toLowerCase(),
          linked_type: 'x_community',
          linked_id: communityId,
          relationship: 'mod_of',
           confidence: 100,
           discovered_via: 'x_community_enricher',
           evidence: { scraped_at: now }
        });
      }

      // Co-mod links: all admins/mods are co-mods with each other
      // SCALING FIX: Limit to first 10 staff to prevent quadratic explosion (n*(n-1)/2)
      // With 10 staff, max 45 co_mod links per community instead of potentially thousands
      const allStaff = [...communityData.adminUsernames, ...communityData.moderatorUsernames];
      const staffForCoMod = allStaff.slice(0, 10); // Cap at 10 staff members
      
      if (allStaff.length > 10) {
        console.log(`[Scaling] Community ${communityId} has ${allStaff.length} staff, limiting co_mod links to first 10`);
      }
      
      for (let i = 0; i < staffForCoMod.length; i++) {
        for (let j = i + 1; j < staffForCoMod.length; j++) {
          meshLinks.push({
            source_type: 'x_account',
            source_id: staffForCoMod[i].toLowerCase(),
            linked_type: 'x_account',
            linked_id: staffForCoMod[j].toLowerCase(),
            relationship: 'co_mod',
            confidence: 90,
            discovered_via: 'x_community_enricher',
            evidence: { community_id: communityId, scraped_at: now, staff_count: allStaff.length }
          });
        }
      }

      // Community → token links
      for (const tokenMint of linkedTokenMints) {
        meshLinks.push({
          source_type: 'x_community',
          source_id: communityId,
          linked_type: 'token',
          linked_id: tokenMint,
          relationship: 'community_for',
          confidence: 95,
          discovered_via: 'x_community_enricher',
          evidence: { scraped_at: now }
        });
      }

      // Batch upsert mesh links
      if (meshLinks.length > 0) {
        const { error: meshError } = await supabase
          .from('reputation_mesh')
          .upsert(meshLinks, { 
            onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
            ignoreDuplicates: true 
          });
        
        if (meshError) {
          console.warn('Failed to upsert mesh links:', meshError.message);
        } else {
          console.log(`Created ${meshLinks.length} mesh links for community ${communityId}`);
        }
      }

      // 🕸️ MESH FEEDER: Feed community admins/mods for all linked tokens
      for (const tokenMint of linkedTokenMints) {
        meshFeed.communityStaff(supabase, {
          tokenMint,
          creatorWallet: linkedWallets[0],
          admins: communityData.adminUsernames,
          mods: communityData.moderatorUsernames,
          source: 'x-community-enricher',
        }).catch(e => console.warn('[mesh-feeder] community staff feed failed:', e));
      }

      // Trigger team detection if enabled
      if (triggerTeamDetection && (linkedTokenMint || linkedWallet)) {
        await supabase.functions.invoke('blacklist-enricher', {
          body: {
            entry_id: null,
            detect_team: true,
            identifiers: {
              token_mints: linkedTokenMint ? [linkedTokenMint] : [],
              wallets: linkedWallet ? [linkedWallet] : [],
              twitter_accounts: allUsernames,
              x_communities: [communityId]
            }
          }
        });
      }

      // Flag community if admins/mods are blacklisted
      if (blacklistedUsers.length > 0) {
        await supabase.from('x_communities').update({
          is_flagged: true,
          flag_reason: `Blacklisted users in community: ${blacklistedUsers.join(', ')}`
        }).eq('community_id', communityId);
      }

      return new Response(JSON.stringify({
        success: true,
        type: 'community',
        communityId,
        admins: communityData.adminUsernames,
        moderators: communityData.moderatorUsernames,
        memberCount: communityData.memberCount,
        crossReference: {
          blacklistedUsers,
          whitelistedUsers
        },
        linkedTokenMints,
        linkedWallets
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Could not determine Twitter URL type'
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("X Community enricher error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
