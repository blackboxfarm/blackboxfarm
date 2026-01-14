import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApifyCommunityMember {
  communityRole: "Admin" | "Moderator" | "member";
  screenName: string;
  name: string;
  restId: string;
  isBlueVerified: boolean;
  followersCount?: number;
  followingCount?: number;
}

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
    // Check if it's not a special path
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

async function fetchCommunityMembers(communityId: string, apifyApiKey: string): Promise<ApifyCommunityMember[]> {
  try {
    console.log(`Fetching X Community members for community ${communityId}...`);
    
    // Use Apify Twitter X Community Member Scraper
    const response = await fetch(
      `https://api.apify.com/v2/acts/danpoletaev~twitter-x-community-member-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: communityId,
          maxItems: 100, // Get admins/mods + some members
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"]
          }
        })
      }
    );

    if (!response.ok) {
      console.error(`Apify API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error('Failed to fetch community members:', error);
    return [];
  }
}

async function processCommunityData(members: ApifyCommunityMember[]): Promise<XCommunityData> {
  const admins: string[] = [];
  const moderators: string[] = [];
  
  for (const member of members) {
    if (member.communityRole === 'Admin') {
      admins.push(member.screenName.toLowerCase());
    } else if (member.communityRole === 'Moderator') {
      moderators.push(member.screenName.toLowerCase());
    }
  }
  
  return {
    communityId: '',
    adminUsernames: [...new Set(admins)],
    moderatorUsernames: [...new Set(moderators)],
    memberCount: members.length,
    rawData: members.slice(0, 20) // Keep first 20 for reference
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apifyApiKey = Deno.env.get("APIFY_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
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
        const members = await fetchCommunityMembers(communityId, apifyApiKey);
        
        if (members.length > 0) {
          communityData = await processCommunityData(members);
          communityData.communityId = communityId;
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
