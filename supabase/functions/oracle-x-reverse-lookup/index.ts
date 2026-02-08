import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface XReverseLookupResult {
  handle: string;
  found: boolean;
  linkedWallets: string[];
  linkedTokens: string[];
  linkedCommunities: Array<{ id: string; name: string; role: 'admin' | 'mod' }>;
  devTeams: Array<{ id: string; name: string }>;
  blacklistStatus: {
    isBlacklisted: boolean;
    entries: Array<{ id: string; reason: string }>;
  };
  whitelistStatus: {
    isWhitelisted: boolean;
    entries: Array<{ id: string; reason: string }>;
  };
  sharedMods: string[];
  relatedXAccounts: string[];
  stats: {
    communitiesModded: number;
    tokensLinked: number;
    walletsLinked: number;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { handle } = await req.json();
    
    if (!handle || typeof handle !== 'string') {
      throw new Error('X handle required');
    }

    // Clean handle - remove @ if present
    const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase();
    console.log(`[XReverseLookup] Searching for handle: ${cleanHandle}`);

    // Search all tables in parallel
    const [
      communitiesResult,
      devTeamsResult,
      blacklistResult,
      whitelistResult,
      developerProfilesResult,
      twitterAccountsResult,
      meshResult
    ] = await Promise.all([
      // X Communities - check admin and mod usernames
      supabase
        .from('x_communities')
        .select('id, community_name, admin_usernames, moderator_usernames, linked_wallet, linked_token')
        .or(`admin_usernames.cs.{${cleanHandle}},moderator_usernames.cs.{${cleanHandle}}`),
      
      // Dev Teams - check member twitter accounts
      supabase
        .from('dev_teams')
        .select('id, team_name, member_wallets, member_twitter_accounts')
        .contains('member_twitter_accounts', [cleanHandle]),
      
      // Blacklist - check linked twitter
      supabase
        .from('pumpfun_blacklist')
        .select('id, wallet_address, reason, linked_twitter, linked_wallets')
        .contains('linked_twitter', [cleanHandle]),
      
      // Whitelist - check by twitter
      supabase
        .from('pumpfun_whitelist')
        .select('id, wallet_address, notes, linked_twitter')
        .contains('linked_twitter', [cleanHandle]),
      
      // Developer profiles with twitter handle
      supabase
        .from('developer_profiles')
        .select('id, master_wallet_address, display_name, twitter_handle')
        .ilike('twitter_handle', cleanHandle),
      
      // Twitter accounts table
      supabase
        .from('twitter_accounts')
        .select('id, handle, wallet_address, linked_communities')
        .ilike('handle', cleanHandle),
      
      // Reputation mesh links
      supabase
        .from('reputation_mesh')
        .select('*')
        .eq('source_type', 'x_account')
        .ilike('source_id', cleanHandle)
    ]);

    // Process communities
    const communities = communitiesResult.data || [];
    const linkedCommunities = communities.map(c => ({
      id: c.id,
      name: c.community_name || 'Unknown',
      role: (c.admin_usernames || []).map((u: string) => u.toLowerCase()).includes(cleanHandle) ? 'admin' as const : 'mod' as const
    }));

    // Extract linked wallets from various sources
    const linkedWallets = new Set<string>();
    const linkedTokens = new Set<string>();
    const sharedMods = new Set<string>();

    // From communities
    communities.forEach(c => {
      if (c.linked_wallet) linkedWallets.add(c.linked_wallet);
      if (c.linked_token) linkedTokens.add(c.linked_token);
      
      // Find other mods in same communities
      const allMods = [...(c.admin_usernames || []), ...(c.moderator_usernames || [])];
      allMods.forEach((mod: string) => {
        if (mod.toLowerCase() !== cleanHandle) {
          sharedMods.add(mod);
        }
      });
    });

    // From dev teams
    const devTeams = devTeamsResult.data || [];
    devTeams.forEach(team => {
      (team.member_wallets || []).forEach((w: string) => linkedWallets.add(w));
    });

    // From blacklist
    const blacklistEntries = blacklistResult.data || [];
    blacklistEntries.forEach(entry => {
      if (entry.wallet_address) linkedWallets.add(entry.wallet_address);
      (entry.linked_wallets || []).forEach((w: string) => linkedWallets.add(w));
    });

    // From whitelist
    const whitelistEntries = whitelistResult.data || [];
    whitelistEntries.forEach(entry => {
      if (entry.wallet_address) linkedWallets.add(entry.wallet_address);
    });

    // From developer profiles
    const devProfiles = developerProfilesResult.data || [];
    devProfiles.forEach(profile => {
      if (profile.master_wallet_address) linkedWallets.add(profile.master_wallet_address);
    });

    // From twitter accounts
    const twitterAccounts = twitterAccountsResult.data || [];
    twitterAccounts.forEach(account => {
      if (account.wallet_address) linkedWallets.add(account.wallet_address);
    });

    // From mesh links
    const meshLinks = meshResult.data || [];
    meshLinks.forEach(link => {
      if (link.linked_type === 'wallet') linkedWallets.add(link.linked_id);
      if (link.linked_type === 'token') linkedTokens.add(link.linked_id);
    });

    // Find related X accounts (co-mods, same teams)
    const relatedXAccounts = new Set<string>();
    devTeams.forEach(team => {
      (team.member_twitter_accounts || []).forEach((handle: string) => {
        if (handle.toLowerCase() !== cleanHandle) {
          relatedXAccounts.add(handle);
        }
      });
    });

    const result: XReverseLookupResult = {
      handle: cleanHandle,
      found: linkedWallets.size > 0 || linkedCommunities.length > 0 || devTeams.length > 0,
      linkedWallets: Array.from(linkedWallets),
      linkedTokens: Array.from(linkedTokens),
      linkedCommunities,
      devTeams: devTeams.map(t => ({ id: t.id, name: t.team_name })),
      blacklistStatus: {
        isBlacklisted: blacklistEntries.length > 0,
        entries: blacklistEntries.map(e => ({ id: e.id, reason: e.reason || 'Unknown' }))
      },
      whitelistStatus: {
        isWhitelisted: whitelistEntries.length > 0,
        entries: whitelistEntries.map(e => ({ id: e.id, reason: e.notes || 'Trusted' }))
      },
      sharedMods: Array.from(sharedMods).slice(0, 20),
      relatedXAccounts: Array.from(relatedXAccounts).slice(0, 20),
      stats: {
        communitiesModded: linkedCommunities.length,
        tokensLinked: linkedTokens.size,
        walletsLinked: linkedWallets.size
      }
    };

    // Store mesh links for discovered relationships
    const newMeshLinks: any[] = [];
    
    linkedWallets.forEach(wallet => {
      newMeshLinks.push({
        source_type: 'x_account',
        source_id: cleanHandle,
        linked_type: 'wallet',
        linked_id: wallet,
        relationship: 'linked',
        confidence: 80,
        discovered_via: 'x_reverse_lookup'
      });
    });

    linkedCommunities.forEach(community => {
      newMeshLinks.push({
        source_type: 'x_account',
        source_id: cleanHandle,
        linked_type: 'x_community',
        linked_id: community.id,
        relationship: community.role === 'admin' ? 'admin_of' : 'mod_of',
        confidence: 100,
        discovered_via: 'x_reverse_lookup'
      });
    });

    sharedMods.forEach(mod => {
      newMeshLinks.push({
        source_type: 'x_account',
        source_id: cleanHandle,
        linked_type: 'x_account',
        linked_id: mod.toLowerCase(),
        relationship: 'co_mod',
        confidence: 70,
        discovered_via: 'x_reverse_lookup'
      });
    });

    // Batch upsert mesh links
    if (newMeshLinks.length > 0) {
      await supabase
        .from('reputation_mesh')
        .upsert(newMeshLinks, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
    }

    console.log(`[XReverseLookup] Found ${linkedWallets.size} wallets, ${linkedCommunities.length} communities for @${cleanHandle}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[XReverseLookup] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
