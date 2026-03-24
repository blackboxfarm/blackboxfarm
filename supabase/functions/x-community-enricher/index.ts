import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { validateCommunityExists } from "../_shared/x-community-validator.ts";
import { alertAndLogCommunityDeletion, CommunityAlertInfo } from "../_shared/x-community-alerts.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { fetchXCommunityAboutAdmin } from "../_shared/x-community-about-admin.ts";
import { resolveXHandle } from "../_shared/x-handle-resolver.ts";

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

function extractCommunityId(url: string): string | null {
  const match = url.match(/communities\/(\d+)/);
  return match ? match[1] : null;
}

function extractTwitterUsername(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i);
  if (match && !['i', 'home', 'search', 'explore'].includes(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  return null;
}

function normalizeScreenName(screenName?: string | null): string | null {
  const normalized = screenName?.trim().replace(/^@/, '').toLowerCase();
  return normalized || null;
}

Deno.serve(withRunLog('x-community-enricher', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const browserlessApiKey = Deno.env.get("BROWSERLESS_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
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
      twitterUrl,
      linkedTokenMint,
      linkedWallet,
      triggerTeamDetection = true,
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
      const username = extractTwitterUsername(urlToProcess);
      if (username) {
        const { data: enrichData } = await supabase.functions.invoke('twitter-profile-enricher', {
          body: { usernames: [username] }
        });

        return new Response(JSON.stringify({
          success: true,
          type: 'account',
          username,
          enrichmentResult: enrichData,
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

      const { data: existingCommunity } = await supabase
        .from('x_communities')
        .select('*')
        .eq('community_id', communityId)
        .single();

      const failCount = existingCommunity?.failed_scrape_count || 0;
      if (failCount >= 3) {
        console.log(`[x-community-enricher] Skipping community ${communityId} - ${failCount} consecutive failures (likely deleted/private)`);
        return new Response(JSON.stringify({
          success: false,
          type: 'community',
          communityId,
          skipped: true,
          reason: `Skipped after ${failCount} consecutive scrape failures. Community likely deleted or private.`,
          failCount,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const lastScrapedMs = existingCommunity?.last_scraped_at
        ? new Date(existingCommunity.last_scraped_at).getTime()
        : 0;
      const timeSinceLastScrape = Date.now() - lastScrapedMs;
      const currentScrapeAt = new Date().toISOString();

      const hasStaffData = Boolean(
        (existingCommunity?.admin_usernames && existingCommunity.admin_usernames.length > 0) ||
        (existingCommunity?.moderator_usernames && existingCommunity.moderator_usernames.length > 0)
      );
      const exhaustedAboutLookup = existingCommunity?.scrape_status === 'no_admin_on_about_page';
      const needsScrape = !hasStaffData && !exhaustedAboutLookup && (
        !existingCommunity ||
        !existingCommunity.last_scraped_at ||
        timeSinceLastScrape > 24 * 60 * 60 * 1000
      );

      const activePendingLock = existingCommunity?.scrape_status === 'pending'
        && lastScrapedMs > 0
        && timeSinceLastScrape < 10 * 60 * 1000;

      if (activePendingLock) {
        console.log(`[x-community-enricher] Skipping ${communityId} - another scrape is already in progress`);
        return new Response(JSON.stringify({
          success: true,
          type: 'community',
          communityId,
          cached: true,
          pending: true,
          admins: existingCommunity?.admin_usernames || [],
          moderators: existingCommunity?.moderator_usernames || [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const recentlyScraped = lastScrapedMs > 0 && timeSinceLastScrape < 5 * 60 * 1000;

      if (recentlyScraped && existingCommunity) {
        console.log(`[x-community-enricher] Skipping ${communityId} - scraped ${Math.round(timeSinceLastScrape / 1000)}s ago (5min cooldown)`);
        return new Response(JSON.stringify({
          success: true,
          type: 'community',
          communityId,
          cached: true,
          cooldown: true,
          admins: existingCommunity.admin_usernames || [],
          moderators: existingCommunity.moderator_usernames || [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let scrapeStatus = existingCommunity?.scrape_status;
      let communityData: XCommunityData = {
        communityId,
        adminUsernames: existingCommunity?.admin_usernames || [],
        moderatorUsernames: existingCommunity?.moderator_usernames || [],
        memberCount: existingCommunity?.member_count || undefined,
        rawData: existingCommunity?.raw_data,
      };

      if (needsScrape && browserlessApiKey) {
        console.log('[x-community-enricher] Fetching community admin from X about page...');

        await supabase.from('x_communities').upsert({
          community_id: communityId,
          community_url: urlToProcess,
          scrape_status: 'pending',
          last_scraped_at: currentScrapeAt,
          updated_at: currentScrapeAt,
        }, { onConflict: 'community_id' });

        const aboutResult = await fetchXCommunityAboutAdmin(communityId, browserlessApiKey);

        if (aboutResult.httpStatus >= 400 || (aboutResult.httpStatus === 0 && aboutResult.error)) {
          const newFailCount = (existingCommunity?.failed_scrape_count || 0) + 1;
          const errorStatus = aboutResult.httpStatus > 0 ? `error_${aboutResult.httpStatus}` : 'error_browserless';
          console.warn(`[x-community-enricher] About-page lookup failed for ${communityId} (fail #${newFailCount}): ${aboutResult.error || aboutResult.httpStatus}`);

          await supabase.from('x_communities').upsert({
            community_id: communityId,
            community_url: urlToProcess,
            failed_scrape_count: newFailCount,
            scrape_status: errorStatus,
            last_scraped_at: currentScrapeAt,
            updated_at: currentScrapeAt,
            raw_data: aboutResult.rawData,
          }, { onConflict: 'community_id' });

          return new Response(JSON.stringify({
            success: false,
            type: 'community',
            communityId,
            error: aboutResult.error || `About page lookup returned ${aboutResult.httpStatus}`,
            failCount: newFailCount,
            willRetryAfter: newFailCount >= 3 ? 'never (max failures reached)' : '24h',
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const existenceCheck = aboutResult.adminUsername
          ? {
              exists: true,
              isDeleted: false,
              memberCount: aboutResult.memberCount ?? undefined,
              checkedAt: currentScrapeAt,
            }
          : await validateCommunityExists(communityId, []);

        if (existenceCheck.isDeleted) {
          console.warn(`[X Community Enricher] Community ${communityId} appears DELETED`);

          const newFailCount = (existingCommunity?.failed_scrape_count || 0) + 1;
          await supabase.from('x_communities').update({
            is_deleted: true,
            deleted_detected_at: currentScrapeAt,
            scrape_status: 'deleted',
            failed_scrape_count: newFailCount,
            last_existence_check_at: currentScrapeAt,
            last_scraped_at: currentScrapeAt,
            raw_data: aboutResult.rawData,
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
              detectedAt: currentScrapeAt,
            };

            const { alerted } = await alertAndLogCommunityDeletion(supabase as any, alertInfo);

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

        const resolvedAdmin = aboutResult.adminUsername
          ? await resolveXHandle(aboutResult.adminUsername, supabase as any)
          : null;
        const normalizedAdmin = normalizeScreenName(resolvedAdmin?.handle || aboutResult.adminUsername);

        communityData = {
          communityId,
          adminUsernames: normalizedAdmin ? [normalizedAdmin] : [],
          moderatorUsernames: [],
          memberCount: aboutResult.memberCount ?? existingCommunity?.member_count ?? undefined,
          rawData: {
            ...aboutResult.rawData,
            resolvedAdmin: resolvedAdmin ? {
              userId: resolvedAdmin.userId,
              displayName: resolvedAdmin.displayName,
              handle: resolvedAdmin.handle,
              isVerified: resolvedAdmin.isVerified,
              isRotated: resolvedAdmin.isRotated,
              handleCount: resolvedAdmin.handleCount,
              linkedTokenCount: resolvedAdmin.linkedTokenCount,
            } : null,
          },
        };
        scrapeStatus = normalizedAdmin ? 'complete' : 'no_admin_on_about_page';

        if (existingCommunity?.failed_scrape_count > 0) {
          await supabase.from('x_communities').update({
            failed_scrape_count: 0,
          }).eq('community_id', communityId);
        }

        if (normalizedAdmin) {
          console.log(`[x-community-enricher] About page admin for ${communityId}: @${normalizedAdmin}`);

          const { data: existingTarget } = await supabase
            .from('community_follow_targets')
            .select('follow_status')
            .eq('community_id', communityId)
            .eq('target_handle', normalizedAdmin)
            .maybeSingle();

          const { error: followUpsertErr } = await supabase
            .from('community_follow_targets')
            .upsert([{
              community_id: communityId,
              target_handle: normalizedAdmin,
              target_x_user_id: resolvedAdmin?.userId || null,
              is_blue_verified: resolvedAdmin?.isVerified || false,
              community_role: 'Admin',
              followers_count: null,
              follow_status: existingTarget?.follow_status || 'not_followed',
              updated_at: currentScrapeAt,
            }], { onConflict: 'community_id,target_handle' });

          if (followUpsertErr) {
            console.warn('[x-community-enricher] Follow targets upsert error:', followUpsertErr.message);
          } else {
            console.log(`[x-community-enricher] ✅ Indexed about-page admin for community ${communityId}`);
          }
        }
      } else if (needsScrape && !browserlessApiKey) {
        console.warn('BROWSERLESS_API_KEY not configured, skipping about-page lookup');
      }

      const linkedTokenMints = existingCommunity?.linked_token_mints || [];
      const linkedWallets = existingCommunity?.linked_wallets || [];

      if (linkedTokenMint && !linkedTokenMints.includes(linkedTokenMint)) {
        linkedTokenMints.push(linkedTokenMint);
      }
      if (linkedWallet && !linkedWallets.includes(linkedWallet)) {
        linkedWallets.push(linkedWallet);
      }

      const { error: upsertError } = await supabase.from('x_communities').upsert({
        community_id: communityId,
        community_url: urlToProcess,
        admin_usernames: communityData.adminUsernames,
        moderator_usernames: communityData.moderatorUsernames,
        member_count: communityData.memberCount,
        linked_token_mints: linkedTokenMints,
        linked_wallets: linkedWallets,
        last_scraped_at: needsScrape && browserlessApiKey ? currentScrapeAt : existingCommunity?.last_scraped_at,
        scrape_status: needsScrape && browserlessApiKey ? scrapeStatus : existingCommunity?.scrape_status,
        raw_data: communityData.rawData || existingCommunity?.raw_data
      }, { onConflict: 'community_id' });

      if (upsertError) {
        console.error('Failed to upsert community:', upsertError);
      }

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

      const meshLinks: any[] = [];
      const now = new Date().toISOString();

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

      const allStaff = [...communityData.adminUsernames, ...communityData.moderatorUsernames];
      const staffForCoMod = allStaff.slice(0, 10);

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

      for (const tokenMint of linkedTokenMints) {
        meshFeed.communityStaff(supabase, {
          tokenMint,
          creatorWallet: linkedWallets[0],
          admins: communityData.adminUsernames,
          mods: communityData.moderatorUsernames,
          source: 'x-community-enricher',
        }).catch(e => console.warn('[mesh-feeder] community staff feed failed:', e));
      }

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
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));

