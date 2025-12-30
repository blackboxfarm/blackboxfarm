import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Risk level thresholds and trading adjustments
const RISK_CONFIG = {
  critical: {
    canTrade: false,
    sellMultiplier: 1.15, // Sell at 15% if somehow traded
    skipReason: 'Developer is blacklisted'
  },
  high: {
    canTrade: true,
    sellMultiplier: 1.3, // Quick 30% exit
    skipReason: null
  },
  medium: {
    canTrade: true,
    sellMultiplier: null, // Use default
    skipReason: null
  },
  low: {
    canTrade: true,
    sellMultiplier: null,
    skipReason: null
  },
  verified: {
    canTrade: true,
    sellMultiplier: null, // Can hold longer
    skipReason: null
  },
  unknown: {
    canTrade: true,
    sellMultiplier: null,
    skipReason: null
  }
};

interface DeveloperEnrichmentResult {
  found: boolean;
  developerId: string | null;
  riskLevel: 'unknown' | 'verified' | 'low' | 'medium' | 'high' | 'critical';
  reputationScore: number;
  warning: string | null;
  canTrade: boolean;
  adjustedSellMultiplier: number | null;
  twitterHandle: string | null;
  totalTokens: number;
  rugCount: number;
  slowDrainCount: number;
  bundledWalletCount: number;
  washTradingDetected: boolean;
  quickDumpCount: number;
  creatorWallet: string | null;
  skipReason: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tokenMint, defaultSellMultiplier } = await req.json();

    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'tokenMint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[developer-enrichment] Starting enrichment for token: ${tokenMint}`);

    // Step 1: Find the token creator wallet
    const creatorWallet = await findTokenCreator(tokenMint);
    
    if (!creatorWallet) {
      console.log(`[developer-enrichment] Could not find creator for token ${tokenMint}`);
      return new Response(
        JSON.stringify({
          found: false,
          developerId: null,
          riskLevel: 'unknown',
          reputationScore: 50,
          warning: null,
          canTrade: true,
          adjustedSellMultiplier: null,
          twitterHandle: null,
          totalTokens: 0,
          rugCount: 0,
          slowDrainCount: 0,
          bundledWalletCount: 0,
          washTradingDetected: false,
          quickDumpCount: 0,
          creatorWallet: null,
          skipReason: null
        } as DeveloperEnrichmentResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[developer-enrichment] Found creator wallet: ${creatorWallet}`);

    // Step 2: Try to extract Twitter from token metadata
    const twitterHandle = await extractTwitterFromToken(tokenMint);
    console.log(`[developer-enrichment] Twitter handle from metadata: ${twitterHandle || 'not found'}`);

    // Step 3: Find or create developer profile
    let developerProfile = await findDeveloperByWallet(supabase, creatorWallet);
    
    if (!developerProfile) {
      // Create new developer profile
      console.log(`[developer-enrichment] Creating new developer profile for ${creatorWallet}`);
      developerProfile = await createDeveloperProfile(supabase, creatorWallet, twitterHandle);
    } else if (twitterHandle && !developerProfile.twitter_handle) {
      // Update existing profile with Twitter if we found one
      await supabase
        .from('developer_profiles')
        .update({ twitter_handle: twitterHandle })
        .eq('id', developerProfile.id);
      developerProfile.twitter_handle = twitterHandle;
    }

    // Step 4: Calculate risk level
    const riskAssessment = calculateRiskLevel(developerProfile);
    
    // Step 5: Determine if we should adjust sell multiplier
    const riskConfig = RISK_CONFIG[riskAssessment.level as keyof typeof RISK_CONFIG] || RISK_CONFIG.unknown;
    let adjustedSellMultiplier: number | null = null;
    
    if (riskConfig.sellMultiplier && defaultSellMultiplier) {
      // Use the lower of the two (more conservative)
      adjustedSellMultiplier = Math.min(riskConfig.sellMultiplier, defaultSellMultiplier);
    } else if (riskConfig.sellMultiplier) {
      adjustedSellMultiplier = riskConfig.sellMultiplier;
    }

    const result: DeveloperEnrichmentResult = {
      found: true,
      developerId: developerProfile.id,
      riskLevel: riskAssessment.level,
      reputationScore: developerProfile.reputation_score || 50,
      warning: riskAssessment.warning,
      canTrade: riskConfig.canTrade,
      adjustedSellMultiplier,
      twitterHandle: developerProfile.twitter_handle || twitterHandle,
      totalTokens: developerProfile.total_tokens_created || 0,
      rugCount: developerProfile.rug_pull_count || 0,
      slowDrainCount: developerProfile.slow_drain_count || 0,
      bundledWalletCount: developerProfile.bundled_wallet_count || 0,
      washTradingDetected: developerProfile.wash_trading_detected || false,
      quickDumpCount: developerProfile.quick_dump_count || 0,
      creatorWallet,
      skipReason: riskConfig.canTrade ? null : riskConfig.skipReason
    };

    console.log(`[developer-enrichment] Result: risk=${result.riskLevel}, canTrade=${result.canTrade}, adjustedMultiplier=${result.adjustedSellMultiplier}`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[developer-enrichment] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Find token creator using Helius API
async function findTokenCreator(tokenMint: string): Promise<string | null> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusKey) {
    console.warn('[developer-enrichment] HELIUS_API_KEY not set');
    return null;
  }

  try {
    // Get token metadata from Helius
    const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [tokenMint] })
    });

    if (!response.ok) {
      console.error(`[developer-enrichment] Helius metadata API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data?.[0]?.onChainAccountInfo?.accountInfo?.data?.parsed?.info?.mintAuthority) {
      return data[0].onChainAccountInfo.accountInfo.data.parsed.info.mintAuthority;
    }

    // Fallback: try to get from transaction history
    const txResponse = await fetch(`https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusKey}&type=MINT`);
    
    if (txResponse.ok) {
      const txData = await txResponse.json();
      if (txData?.[0]?.feePayer) {
        return txData[0].feePayer;
      }
    }

    return null;
  } catch (error) {
    console.error('[developer-enrichment] Error finding token creator:', error);
    return null;
  }
}

// Extract Twitter handle from token metadata
async function extractTwitterFromToken(tokenMint: string): Promise<string | null> {
  try {
    // Try Jupiter first
    const jupResponse = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (jupResponse.ok) {
      const jupData = await jupResponse.json();
      if (jupData?.extensions?.twitter) {
        return cleanTwitterHandle(jupData.extensions.twitter);
      }
    }

    // Try DexScreener
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const pair = dexData?.pairs?.[0];
      if (pair?.info?.socials) {
        const twitterSocial = pair.info.socials.find((s: any) => s.type === 'twitter');
        if (twitterSocial?.url) {
          return cleanTwitterHandle(twitterSocial.url);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[developer-enrichment] Error extracting Twitter:', error);
    return null;
  }
}

// Clean Twitter handle from URL or @mention
function cleanTwitterHandle(input: string): string | null {
  if (!input) return null;
  
  // Remove URL parts
  let handle = input
    .replace(/https?:\/\/(www\.)?(twitter|x)\.com\//gi, '')
    .replace(/\?.*$/, '') // Remove query params
    .replace(/\/$/, '') // Remove trailing slash
    .replace(/^@/, ''); // Remove @ prefix
  
  // Validate - should be alphanumeric with underscores
  if (/^[a-zA-Z0-9_]{1,15}$/.test(handle)) {
    return handle;
  }
  
  return null;
}

// Find developer by wallet address
async function findDeveloperByWallet(supabase: any, walletAddress: string): Promise<any> {
  // Check master wallet
  const { data: profile } = await supabase
    .from('developer_profiles')
    .select('*')
    .eq('master_wallet_address', walletAddress)
    .single();

  if (profile) return profile;

  // Check developer_wallets table
  const { data: wallet } = await supabase
    .from('developer_wallets')
    .select('developer_id')
    .eq('wallet_address', walletAddress)
    .single();

  if (wallet?.developer_id) {
    const { data: devProfile } = await supabase
      .from('developer_profiles')
      .select('*')
      .eq('id', wallet.developer_id)
      .single();
    return devProfile;
  }

  return null;
}

// Create new developer profile
async function createDeveloperProfile(supabase: any, walletAddress: string, twitterHandle: string | null): Promise<any> {
  const { data, error } = await supabase
    .from('developer_profiles')
    .insert({
      master_wallet_address: walletAddress,
      twitter_handle: twitterHandle,
      reputation_score: 50, // Neutral starting score
      trust_level: 'neutral',
      total_tokens_created: 1,
      source: 'fantasy_enrichment'
    })
    .select()
    .single();

  if (error) {
    console.error('[developer-enrichment] Error creating profile:', error);
    throw error;
  }

  // Also create wallet entry
  await supabase
    .from('developer_wallets')
    .insert({
      developer_id: data.id,
      wallet_address: walletAddress,
      wallet_type: 'creator',
      is_primary: true
    });

  return data;
}

// Calculate risk level based on developer profile
function calculateRiskLevel(profile: any): { level: string; warning: string | null } {
  // Critical: Blacklisted
  if (profile.trust_level === 'blacklisted') {
    return {
      level: 'critical',
      warning: profile.blacklist_reason || 'Developer is blacklisted due to confirmed malicious activity'
    };
  }

  // High risk indicators
  const rugCount = profile.rug_pull_count || 0;
  const slowDrainCount = profile.slow_drain_count || 0;
  const bundledWallets = profile.bundled_wallet_count || 0;
  const washTrading = profile.wash_trading_detected || false;
  const quickDumps = profile.quick_dump_count || 0;
  const reputationScore = profile.reputation_score || 50;

  // Any rugs = at least high risk
  if (rugCount > 0) {
    if (rugCount >= 2) {
      return {
        level: 'critical',
        warning: `Developer has ${rugCount} confirmed rug pulls`
      };
    }
    return {
      level: 'high',
      warning: `Developer has ${rugCount} rug pull on record`
    };
  }

  // Slow drains are concerning
  if (slowDrainCount >= 2) {
    return {
      level: 'high',
      warning: `Developer has ${slowDrainCount} slow drain patterns detected`
    };
  }

  // Bundled wallets + wash trading = manipulation
  if (bundledWallets >= 3 && washTrading) {
    return {
      level: 'high',
      warning: `Suspicious activity: ${bundledWallets} bundled wallets + wash trading detected`
    };
  }

  // Multiple quick dumps
  if (quickDumps >= 3) {
    return {
      level: 'high',
      warning: `Developer frequently dumps tokens quickly (${quickDumps} instances)`
    };
  }

  // Medium risk indicators
  if (slowDrainCount === 1 || bundledWallets >= 2 || quickDumps >= 2) {
    return {
      level: 'medium',
      warning: 'Some concerning patterns detected - proceed with caution'
    };
  }

  // Low reputation score
  if (reputationScore < 30) {
    return {
      level: 'high',
      warning: 'Very low reputation score'
    };
  }

  if (reputationScore < 50) {
    return {
      level: 'medium',
      warning: 'Below average reputation'
    };
  }

  // Verified/trusted developers
  if (profile.trust_level === 'trusted' || profile.kyc_verified) {
    return {
      level: 'verified',
      warning: null
    };
  }

  // Good reputation
  if (reputationScore >= 70) {
    return {
      level: 'low',
      warning: null
    };
  }

  // Default to unknown for new developers
  if (!profile.total_tokens_created || profile.total_tokens_created <= 1) {
    return {
      level: 'unknown',
      warning: 'New developer - no track record'
    };
  }

  return {
    level: 'low',
    warning: null
  };
}
