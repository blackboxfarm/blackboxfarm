import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'walletAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[dev-rep] Fetching reputation for wallet: ${walletAddress}`);

    // Query ALL reputation sources in parallel
    const [
      devWalletRepResult,
      blacklistResult,
      whitelistResult,
      meshLinksResult,
      developerProfileResult,
      developerTokensResult,
    ] = await Promise.all([
      // Primary: dev_wallet_reputation (16k+ entries)
      supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle(),

      // Blacklist: check by identifier AND linked_wallets
      supabase
        .from('pumpfun_blacklist')
        .select('*')
        .or(`identifier.eq.${walletAddress},linked_wallets.cs.{${walletAddress}}`)
        .eq('is_active', true)
        .limit(5),

      // Whitelist: check by identifier AND linked_wallets
      supabase
        .from('pumpfun_whitelist')
        .select('*')
        .or(`identifier.eq.${walletAddress},linked_wallets.cs.{${walletAddress}}`)
        .eq('is_active', true)
        .limit(5),

      // Reputation mesh: find all connections
      supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, source_type, linked_type, relationship, confidence')
        .or(`source_id.eq.${walletAddress},linked_id.eq.${walletAddress}`)
        .limit(50),

      // Legacy: developer_profiles
      supabase
        .from('developer_profiles')
        .select('*')
        .eq('master_wallet_address', walletAddress)
        .maybeSingle(),

      // Developer tokens for stats
      supabase
        .from('developer_tokens')
        .select('token_mint, token_symbol, outcome, is_active')
        .eq('creator_wallet', walletAddress)
        .limit(200),
    ]);

    const devWalletRep = devWalletRepResult.data;
    const blacklistEntries = blacklistResult.data || [];
    const whitelistEntries = whitelistResult.data || [];
    const meshLinks = meshLinksResult.data || [];
    const developerProfile = developerProfileResult.data;
    const developerTokens = developerTokensResult.data || [];

    const isBlacklisted = blacklistEntries.length > 0;
    const isWhitelisted = whitelistEntries.length > 0;
    const hasAnyData = !!(devWalletRep || isBlacklisted || isWhitelisted || developerProfile || developerTokens.length > 0 || meshLinks.length > 0);

    if (!hasAnyData) {
      return new Response(
        JSON.stringify({
          found: false,
          message: 'Wallet not in developer intelligence database',
          riskLevel: 'unknown',
          canTrade: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build unified stats from best available source
    const stats = {
      totalTokens: devWalletRep?.total_tokens_launched || developerProfile?.total_tokens_created || developerTokens.length || 0,
      successfulTokens: devWalletRep?.tokens_successful || developerProfile?.successful_tokens || developerTokens.filter(t => t.outcome === 'success' || t.outcome === 'graduated').length || 0,
      failedTokens: devWalletRep?.tokens_rugged || developerProfile?.failed_tokens || developerTokens.filter(t => t.outcome === 'failed').length || 0,
      rugPulls: developerProfile?.rug_pull_count || devWalletRep?.tokens_rugged || 0,
      slowDrains: developerProfile?.slow_drain_count || 0,
      reputationScore: devWalletRep?.reputation_score || developerProfile?.reputation_score || 50,
      trustLevel: devWalletRep?.trust_level || developerProfile?.trust_level || 'neutral',
      devPattern: devWalletRep?.dev_pattern || null,
      successRate: devWalletRep?.success_rate_pct || 0,
    };

    // Determine risk level — blacklist ALWAYS overrides everything
    let riskLevel = 'unknown';
    let riskColor = 'gray';
    let canTrade = true;
    let warning = '';

    if (isBlacklisted) {
      // Hard block: blacklisted by Master Spider or manual submission
      riskLevel = 'critical';
      riskColor = 'red';
      canTrade = false;
      const reasons = blacklistEntries.map(e => e.blacklist_reason).filter(Boolean);
      warning = `BLACKLISTED: ${reasons[0] || 'Known bad actor'}`;
    } else if (['scammer', 'serial_rugger', 'blacklisted'].includes(stats.trustLevel)) {
      // dev_wallet_reputation flagged as bad
      riskLevel = 'critical';
      riskColor = 'red';
      canTrade = false;
      warning = `Flagged as ${stats.trustLevel} in reputation database (${stats.rugPulls} rugs, score: ${stats.reputationScore})`;
    } else if (['serial_spammer', 'fee_farmer'].includes(stats.devPattern || '')) {
      riskLevel = 'high';
      riskColor = 'orange';
      canTrade = true;
      warning = `Dev pattern: ${stats.devPattern} — ${stats.totalTokens} tokens, ${stats.successRate?.toFixed(1)}% success rate`;
    } else if (stats.reputationScore < 30) {
      riskLevel = 'high';
      riskColor = 'orange';
      canTrade = true;
      warning = 'Low reputation score indicates high risk';
    } else if (isWhitelisted) {
      riskLevel = 'verified';
      riskColor = 'blue';
      canTrade = true;
      const reasons = whitelistEntries.map(e => e.whitelist_reason).filter(Boolean);
      warning = reasons[0] || '';
    } else if (['trusted', 'legitimate_builder', 'success'].includes(stats.trustLevel)) {
      riskLevel = 'verified';
      riskColor = 'blue';
      canTrade = true;
      warning = '';
    } else if (stats.reputationScore < 50) {
      riskLevel = 'medium';
      riskColor = 'yellow';
      canTrade = true;
      warning = 'Moderate risk — proceed with caution';
    } else if (stats.reputationScore < 70) {
      riskLevel = 'low';
      riskColor = 'green';
      canTrade = true;
      warning = '';
    } else {
      riskLevel = 'verified';
      riskColor = 'blue';
      canTrade = true;
      warning = '';
    }

    // Extract network from mesh
    const linkedWallets = new Set<string>();
    const linkedXAccounts = new Set<string>();
    for (const link of meshLinks) {
      const isSource = link.source_id === walletAddress;
      const otherId = isSource ? link.linked_id : link.source_id;
      const otherType = isSource ? link.linked_type : link.source_type;
      if (otherType === 'wallet') linkedWallets.add(otherId);
      if (otherType === 'x_account') linkedXAccounts.add(otherId);
    }

    return new Response(
      JSON.stringify({
        found: true,
        walletAddress,
        profile: developerProfile ? {
          id: developerProfile.id,
          displayName: developerProfile.display_name,
          masterWallet: developerProfile.master_wallet_address,
          kycVerified: developerProfile.kyc_verified,
          tags: developerProfile.tags || []
        } : undefined,
        risk: {
          level: riskLevel,
          color: riskColor,
          score: stats.reputationScore,
          trustLevel: stats.trustLevel,
          devPattern: stats.devPattern,
          canTrade,
          warning
        },
        stats,
        blacklist: isBlacklisted ? {
          entries: blacklistEntries.map(e => ({
            identifier: e.identifier,
            reason: e.blacklist_reason,
            riskLevel: e.risk_level,
            entryType: e.entry_type,
            tags: e.tags,
          }))
        } : null,
        whitelist: isWhitelisted ? {
          entries: whitelistEntries.map(e => ({
            identifier: e.identifier,
            reason: e.whitelist_reason,
            trustLevel: e.trust_level,
          }))
        } : null,
        network: {
          linkedWallets: [...linkedWallets].slice(0, 20),
          linkedXAccounts: [...linkedXAccounts].slice(0, 10),
          meshLinksCount: meshLinks.length,
        },
        lastAnalyzed: devWalletRep?.last_analyzed_at || developerProfile?.last_analysis_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[dev-rep] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
