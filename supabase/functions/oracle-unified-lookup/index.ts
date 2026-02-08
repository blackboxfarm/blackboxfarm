import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OracleResult {
  found: boolean;
  inputType: 'token' | 'wallet' | 'x_account' | 'unknown';
  resolvedWallet?: string;
  profile?: {
    id: string;
    displayName: string;
    masterWallet: string;
    kycVerified: boolean;
    tags: string[];
  };
  score: number;
  trafficLight: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'UNKNOWN';
  stats: {
    totalTokens: number;
    successfulTokens: number;
    failedTokens: number;
    rugPulls: number;
    slowDrains: number;
    avgLifespanHours: number;
  };
  network: {
    linkedWallets: string[];
    linkedXAccounts: string[];
    sharedMods: string[];
    relatedTokens: string[];
    devTeam?: { id: string; name: string };
  };
  blacklistStatus: {
    isBlacklisted: boolean;
    reason?: string;
    linkedEntities?: string[];
  };
  whitelistStatus: {
    isWhitelisted: boolean;
    reason?: string;
  };
  recommendation: string;
  meshLinksAdded: number;
}

function isBase58(str: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(str) && str.length >= 32 && str.length <= 44;
}

function detectInputType(input: string): 'token' | 'wallet' | 'x_account' | 'unknown' {
  const cleaned = input.trim();
  
  if (cleaned.startsWith('@')) {
    return 'x_account';
  }
  
  if (isBase58(cleaned)) {
    // Could be token or wallet - we'll try token first
    return 'token';
  }
  
  // Check if it looks like an X handle without @
  if (/^[a-zA-Z0-9_]{1,15}$/.test(cleaned)) {
    return 'x_account';
  }
  
  return 'unknown';
}

function calculateScore(stats: OracleResult['stats'], blacklisted: boolean, whitelisted: boolean): number {
  let score = 50; // Base score
  
  // Negative signals
  score -= (stats.rugPulls || 0) * 30;
  score -= (stats.slowDrains || 0) * 20;
  score -= (stats.failedTokens || 0) * 5;
  if (stats.avgLifespanHours < 24 && stats.totalTokens > 0) score -= 15;
  if (blacklisted) score -= 30;
  
  // Positive signals
  score += (stats.successfulTokens || 0) * 15;
  if (whitelisted) score += 20;
  if (stats.totalTokens > 5 && stats.successfulTokens / stats.totalTokens > 0.5) score += 15;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

function getTrafficLight(score: number): OracleResult['trafficLight'] {
  if (score < 20) return 'RED';
  if (score < 40) return 'RED';
  if (score < 60) return 'YELLOW';
  if (score < 80) return 'GREEN';
  return 'BLUE';
}

function generateRecommendation(score: number, stats: OracleResult['stats']): string {
  if (score < 20) {
    return `🔴 SERIAL RUGGER - ${stats.rugPulls} confirmed rugs, ${stats.slowDrains} slow bleeds. AVOID at all costs. This developer has a 0% success rate.`;
  }
  if (score < 40) {
    return `🔴 HIGH RISK - ${stats.failedTokens} failed tokens, avg lifespan ${stats.avgLifespanHours?.toFixed(1) || 'N/A'}hrs. If you enter, treat as a flip only. Set sell at 2x max, exit within 30 mins.`;
  }
  if (score < 60) {
    return `🟡 CAUTION - Mixed history (${stats.successfulTokens}/${stats.totalTokens} success rate). Reasonable for small positions with quick exit plan.`;
  }
  if (score < 80) {
    return `🟢 MODERATE TRUST - ${stats.successfulTokens} successful tokens. Standard due diligence applies.`;
  }
  return `🔵 VERIFIED BUILDER - Consistent track record with ${stats.successfulTokens} active tokens. Lower risk for longer-term positions.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { input } = await req.json();
    
    if (!input || typeof input !== 'string') {
      throw new Error('Input string required (token address, wallet, or @X handle)');
    }

    const cleanedInput = input.trim().replace(/^@/, '');
    const inputType = detectInputType(input);
    console.log(`[Oracle] Processing input: ${cleanedInput}, type: ${inputType}`);

    let resolvedWallet: string | undefined;
    let xAccountData: any = null;

    // Step 1: Resolve to wallet based on input type
    if (inputType === 'x_account') {
      // Call oracle-x-reverse-lookup for X account resolution
      const { data: xData, error: xError } = await supabase.functions.invoke('oracle-x-reverse-lookup', {
        body: { handle: cleanedInput }
      });
      
      if (!xError && xData?.linkedWallets?.length > 0) {
        resolvedWallet = xData.linkedWallets[0];
        xAccountData = xData;
      }
    } else if (inputType === 'token') {
      // Try to find creator wallet for this token
      const { data: lifecycle } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet, developer_id')
        .eq('token_mint', cleanedInput)
        .single();
      
      if (lifecycle?.creator_wallet) {
        resolvedWallet = lifecycle.creator_wallet;
      } else {
        // Try token-creator-linker to find creator
        try {
          const { data: linkerData } = await supabase.functions.invoke('token-creator-linker', {
            body: { tokenMints: [cleanedInput] }
          });
          
          // Re-query after linking
          const { data: updatedLifecycle } = await supabase
            .from('token_lifecycle')
            .select('creator_wallet')
            .eq('token_mint', cleanedInput)
            .single();
          
          resolvedWallet = updatedLifecycle?.creator_wallet;
        } catch (e) {
          console.log('[Oracle] Token creator linker failed:', e);
        }
      }
      
      // If still no wallet, treat input as wallet
      if (!resolvedWallet) {
        resolvedWallet = cleanedInput;
      }
    } else {
      // Assume it's a wallet address
      resolvedWallet = cleanedInput;
    }

    // Step 2: Query all reputation sources in parallel
    const [
      developerProfileResult,
      devWalletRepResult,
      blacklistResult,
      whitelistResult,
      devTeamsResult,
      developerTokensResult,
      meshLinksResult
    ] = await Promise.all([
      // Developer profiles
      supabase
        .from('developer_profiles')
        .select('*')
        .eq('master_wallet_address', resolvedWallet || '')
        .maybeSingle(),
      
      // Dev wallet reputation
      supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', resolvedWallet || '')
        .maybeSingle(),
      
      // Blacklist check
      supabase
        .from('pumpfun_blacklist')
        .select('*')
        .or(`wallet_address.eq.${resolvedWallet},linked_wallets.cs.{${resolvedWallet}}`)
        .limit(1),
      
      // Whitelist check
      supabase
        .from('pumpfun_whitelist')
        .select('*')
        .or(`wallet_address.eq.${resolvedWallet},linked_wallets.cs.{${resolvedWallet}}`)
        .limit(1),
      
      // Dev teams
      supabase
        .from('dev_teams')
        .select('*')
        .contains('member_wallets', [resolvedWallet || ''])
        .limit(1),
      
      // Developer tokens
      supabase
        .from('developer_tokens')
        .select('token_mint, token_symbol, is_active, outcome')
        .eq('creator_wallet', resolvedWallet || '')
        .limit(20),
      
      // Existing mesh links
      supabase
        .from('reputation_mesh')
        .select('*')
        .or(`source_id.eq.${resolvedWallet},linked_id.eq.${resolvedWallet}`)
        .limit(50)
    ]);

    // Extract data from results
    const developerProfile = developerProfileResult.data;
    const devWalletRep = devWalletRepResult.data;
    const blacklistEntry = blacklistResult.data?.[0];
    const whitelistEntry = whitelistResult.data?.[0];
    const devTeam = devTeamsResult.data?.[0];
    const developerTokens = developerTokensResult.data || [];
    const meshLinks = meshLinksResult.data || [];

    // Calculate stats
    const stats: OracleResult['stats'] = {
      totalTokens: developerProfile?.total_tokens_created || developerTokens.length || 0,
      successfulTokens: developerProfile?.successful_tokens || developerTokens.filter(t => t.outcome === 'success').length || 0,
      failedTokens: developerProfile?.failed_tokens || developerTokens.filter(t => t.outcome === 'failed').length || 0,
      rugPulls: developerProfile?.rug_pull_count || devWalletRep?.rug_pull_count || 0,
      slowDrains: developerProfile?.slow_drain_count || devWalletRep?.slow_drain_count || 0,
      avgLifespanHours: developerProfile?.avg_token_lifespan_hours || 0
    };

    // Calculate score and traffic light
    const isBlacklisted = !!blacklistEntry;
    const isWhitelisted = !!whitelistEntry;
    const score = calculateScore(stats, isBlacklisted, isWhitelisted);
    const trafficLight = getTrafficLight(score);
    const recommendation = generateRecommendation(score, stats);

    // Build network associations
    const network: OracleResult['network'] = {
      linkedWallets: xAccountData?.linkedWallets || [],
      linkedXAccounts: xAccountData?.linkedXAccounts || developerProfile?.twitter_handle ? [developerProfile.twitter_handle] : [],
      sharedMods: xAccountData?.sharedMods || [],
      relatedTokens: developerTokens.map(t => t.token_symbol || t.token_mint).slice(0, 10),
      devTeam: devTeam ? { id: devTeam.id, name: devTeam.team_name } : undefined
    };

    // Store new mesh links for relationships discovered
    let meshLinksAdded = 0;
    const newLinks: any[] = [];

    if (resolvedWallet && inputType === 'token') {
      newLinks.push({
        source_type: 'wallet',
        source_id: resolvedWallet,
        linked_type: 'token',
        linked_id: cleanedInput,
        relationship: 'created',
        confidence: 100,
        discovered_via: 'public_query'
      });
    }

    if (resolvedWallet && inputType === 'x_account') {
      newLinks.push({
        source_type: 'x_account',
        source_id: cleanedInput,
        linked_type: 'wallet',
        linked_id: resolvedWallet,
        relationship: 'linked',
        confidence: 80,
        discovered_via: 'public_query'
      });
    }

    // Upsert mesh links
    if (newLinks.length > 0) {
      const { data: insertedLinks } = await supabase
        .from('reputation_mesh')
        .upsert(newLinks, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' })
        .select();
      meshLinksAdded = insertedLinks?.length || 0;
    }

    const result: OracleResult = {
      found: !!(developerProfile || devWalletRep || blacklistEntry || whitelistEntry || developerTokens.length > 0),
      inputType,
      resolvedWallet,
      profile: developerProfile ? {
        id: developerProfile.id,
        displayName: developerProfile.display_name || `Dev ${resolvedWallet?.slice(0, 8)}`,
        masterWallet: developerProfile.master_wallet_address,
        kycVerified: developerProfile.kyc_verified || false,
        tags: developerProfile.tags || []
      } : undefined,
      score,
      trafficLight,
      stats,
      network,
      blacklistStatus: {
        isBlacklisted,
        reason: blacklistEntry?.reason,
        linkedEntities: blacklistEntry?.linked_wallets || []
      },
      whitelistStatus: {
        isWhitelisted,
        reason: whitelistEntry?.notes
      },
      recommendation,
      meshLinksAdded
    };

    console.log(`[Oracle] Result: score=${score}, trafficLight=${trafficLight}, found=${result.found}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[Oracle] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
