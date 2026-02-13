import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';
enableHeliusTracking('developer-enrichment');

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

// RugCheck configuration
const RUGCHECK_CONFIG = {
  // Skip if normalised score > 50 (risky)
  maxNormalisedScore: 50,
  
  // Auto-skip if these risks detected
  criticalRisks: [
    'Freeze Authority still enabled',
    'Mint Authority still enabled',
    'Copycat token',
    'Top 10 holders own',
  ],
  
  // Reduce sell target if these detected
  warningRisks: [
    'Low amount of LP Providers',
    'High holder concentration', 
    'Low Liquidity',
    'Single holder owns',
  ],
  
  // If LP locked < 80%, reduce hold time
  minLpLockedPct: 80
};

interface RugCheckResult {
  passed: boolean;
  score: number;
  normalised: number;
  lpLockedPct: number | null;
  risks: any[];
  skipReason: string | null;
  adjustSellMultiplier: boolean;
  rugged: boolean;
}

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
  // RugCheck fields
  rugcheckPassed: boolean;
  rugcheckScore: number;
  rugcheckNormalised: number;
  rugcheckRisks: any[];
  rugcheckLpLockedPct: number | null;
  rugcheckSkipReason: string | null;
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

    // Run RugCheck and developer enrichment in parallel
    const [rugcheckResult, creatorWallet] = await Promise.all([
      checkRugcheck(tokenMint),
      findTokenCreator(tokenMint)
    ]);

    console.log(`[developer-enrichment] RugCheck result: passed=${rugcheckResult.passed}, score=${rugcheckResult.normalised}, risks=${rugcheckResult.risks.length}`);

    // If RugCheck fails with critical risk, we can skip developer lookup
    if (!rugcheckResult.passed && rugcheckResult.skipReason) {
      console.log(`[developer-enrichment] RugCheck FAILED: ${rugcheckResult.skipReason}`);
      return new Response(
        JSON.stringify({
          found: false,
          developerId: null,
          riskLevel: 'critical',
          reputationScore: 0,
          warning: rugcheckResult.skipReason,
          canTrade: false,
          adjustedSellMultiplier: 1.15,
          twitterHandle: null,
          totalTokens: 0,
          rugCount: 0,
          slowDrainCount: 0,
          bundledWalletCount: 0,
          washTradingDetected: false,
          quickDumpCount: 0,
          creatorWallet: null,
          skipReason: rugcheckResult.skipReason,
          rugcheckPassed: false,
          rugcheckScore: rugcheckResult.score,
          rugcheckNormalised: rugcheckResult.normalised,
          rugcheckRisks: rugcheckResult.risks,
          rugcheckLpLockedPct: rugcheckResult.lpLockedPct,
          rugcheckSkipReason: rugcheckResult.skipReason
        } as DeveloperEnrichmentResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!creatorWallet) {
      console.log(`[developer-enrichment] Could not find creator for token ${tokenMint}`);
      return new Response(
        JSON.stringify({
          found: false,
          developerId: null,
          riskLevel: 'unknown',
          reputationScore: 50,
          warning: null,
          canTrade: rugcheckResult.passed,
          adjustedSellMultiplier: rugcheckResult.adjustSellMultiplier ? 1.3 : null,
          twitterHandle: null,
          totalTokens: 0,
          rugCount: 0,
          slowDrainCount: 0,
          bundledWalletCount: 0,
          washTradingDetected: false,
          quickDumpCount: 0,
          creatorWallet: null,
          skipReason: rugcheckResult.skipReason,
          rugcheckPassed: rugcheckResult.passed,
          rugcheckScore: rugcheckResult.score,
          rugcheckNormalised: rugcheckResult.normalised,
          rugcheckRisks: rugcheckResult.risks,
          rugcheckLpLockedPct: rugcheckResult.lpLockedPct,
          rugcheckSkipReason: rugcheckResult.skipReason
        } as DeveloperEnrichmentResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[developer-enrichment] Found creator wallet: ${creatorWallet}`);

    // Try to extract Twitter from token metadata
    const twitterHandle = await extractTwitterFromToken(tokenMint);
    console.log(`[developer-enrichment] Twitter handle from metadata: ${twitterHandle || 'not found'}`);

    // Find or create developer profile
    let developerProfile = await findDeveloperByWallet(supabase, creatorWallet);
    
    if (!developerProfile) {
      console.log(`[developer-enrichment] Creating new developer profile for ${creatorWallet}`);
      developerProfile = await createDeveloperProfile(supabase, creatorWallet, twitterHandle);
    } else if (twitterHandle && !developerProfile.twitter_handle) {
      await supabase
        .from('developer_profiles')
        .update({ twitter_handle: twitterHandle })
        .eq('id', developerProfile.id);
      developerProfile.twitter_handle = twitterHandle;
    }

    // Calculate developer risk level
    const riskAssessment = calculateRiskLevel(developerProfile);
    
    // Combine developer risk with RugCheck risk
    const combinedRisk = combineRiskAssessments(riskAssessment, rugcheckResult);
    
    // Determine final sell multiplier
    const riskConfig = RISK_CONFIG[combinedRisk.level as keyof typeof RISK_CONFIG] || RISK_CONFIG.unknown;
    let adjustedSellMultiplier: number | null = null;
    
    if (riskConfig.sellMultiplier && defaultSellMultiplier) {
      adjustedSellMultiplier = Math.min(riskConfig.sellMultiplier, defaultSellMultiplier);
    } else if (riskConfig.sellMultiplier) {
      adjustedSellMultiplier = riskConfig.sellMultiplier;
    } else if (rugcheckResult.adjustSellMultiplier) {
      adjustedSellMultiplier = 1.3; // Reduce target if LP concerns
    }

    const result: DeveloperEnrichmentResult = {
      found: true,
      developerId: developerProfile.id,
      riskLevel: combinedRisk.level,
      reputationScore: developerProfile.reputation_score || 50,
      warning: combinedRisk.warning,
      canTrade: combinedRisk.canTrade,
      adjustedSellMultiplier,
      twitterHandle: developerProfile.twitter_handle || twitterHandle,
      totalTokens: developerProfile.total_tokens_created || 0,
      rugCount: developerProfile.rug_pull_count || 0,
      slowDrainCount: developerProfile.slow_drain_count || 0,
      bundledWalletCount: developerProfile.bundled_wallet_count || 0,
      washTradingDetected: developerProfile.wash_trading_detected || false,
      quickDumpCount: developerProfile.quick_dump_count || 0,
      creatorWallet,
      skipReason: combinedRisk.canTrade ? null : combinedRisk.skipReason,
      rugcheckPassed: rugcheckResult.passed,
      rugcheckScore: rugcheckResult.score,
      rugcheckNormalised: rugcheckResult.normalised,
      rugcheckRisks: rugcheckResult.risks,
      rugcheckLpLockedPct: rugcheckResult.lpLockedPct,
      rugcheckSkipReason: rugcheckResult.skipReason
    };

    console.log(`[developer-enrichment] Result: risk=${result.riskLevel}, canTrade=${result.canTrade}, rugcheck=${rugcheckResult.normalised}/100`);

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

// ============================================================================
// RUGCHECK API INTEGRATION
// ============================================================================

async function checkRugcheck(tokenMint: string): Promise<RugCheckResult> {
  try {
    console.log(`[developer-enrichment] Calling RugCheck API for ${tokenMint}`);
    
    const response = await fetch(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BlindApeAlpha/1.0'
        }
      }
    );

    if (!response.ok) {
      console.warn(`[developer-enrichment] RugCheck API returned ${response.status}, proceeding with caution`);
      return {
        passed: true,
        score: 0,
        normalised: 0,
        lpLockedPct: null,
        risks: [],
        skipReason: null,
        adjustSellMultiplier: false,
        rugged: false
      };
    }

    const data = await response.json();
    console.log(`[developer-enrichment] RugCheck response: score=${data.score}, normalised=${data.score_normalised}, rugged=${data.rugged}`);

    // Check if already rugged
    if (data.rugged) {
      return {
        passed: false,
        score: data.score || 0,
        normalised: data.score_normalised || 100,
        lpLockedPct: data.lpLockedPct || null,
        risks: data.risks || [],
        skipReason: 'Token has already been rugged',
        adjustSellMultiplier: false,
        rugged: true
      };
    }

    // Check for critical risks
    const risks = data.risks || [];
    for (const risk of risks) {
      const riskName = risk.name || risk.description || '';
      for (const critical of RUGCHECK_CONFIG.criticalRisks) {
        if (riskName.toLowerCase().includes(critical.toLowerCase())) {
          console.log(`[developer-enrichment] Critical risk detected: ${riskName}`);
          return {
            passed: false,
            score: data.score || 0,
            normalised: data.score_normalised || 0,
            lpLockedPct: data.lpLockedPct || null,
            risks,
            skipReason: `RugCheck: ${riskName}`,
            adjustSellMultiplier: false,
            rugged: false
          };
        }
      }
    }

    // Check normalised score threshold
    const normalisedScore = data.score_normalised || 0;
    if (normalisedScore > RUGCHECK_CONFIG.maxNormalisedScore) {
      return {
        passed: false,
        score: data.score || 0,
        normalised: normalisedScore,
        lpLockedPct: data.lpLockedPct || null,
        risks,
        skipReason: `RugCheck score too high: ${normalisedScore}/100`,
        adjustSellMultiplier: false,
        rugged: false
      };
    }

    // Check for warning risks that should reduce sell target
    let hasWarningRisk = false;
    for (const risk of risks) {
      const riskName = risk.name || risk.description || '';
      for (const warning of RUGCHECK_CONFIG.warningRisks) {
        if (riskName.toLowerCase().includes(warning.toLowerCase())) {
          hasWarningRisk = true;
          break;
        }
      }
    }

    // Check LP locked percentage
    const lpLockedPct = data.lpLockedPct || null;
    const adjustForLp = lpLockedPct !== null && lpLockedPct < RUGCHECK_CONFIG.minLpLockedPct;

    return {
      passed: true,
      score: data.score || 0,
      normalised: normalisedScore,
      lpLockedPct,
      risks,
      skipReason: null,
      adjustSellMultiplier: hasWarningRisk || adjustForLp,
      rugged: false
    };

  } catch (error) {
    console.error('[developer-enrichment] RugCheck API error:', error);
    // Fail open - allow trade but log the error
    return {
      passed: true,
      score: 0,
      normalised: 0,
      lpLockedPct: null,
      risks: [],
      skipReason: null,
      adjustSellMultiplier: false,
      rugged: false
    };
  }
}

// ============================================================================
// COMBINED RISK ASSESSMENT
// ============================================================================

function combineRiskAssessments(
  devRisk: { level: string; warning: string | null },
  rugcheck: RugCheckResult
): { level: string; warning: string | null; canTrade: boolean; skipReason: string | null } {
  // RugCheck failure overrides developer risk
  if (!rugcheck.passed) {
    return {
      level: 'critical',
      warning: rugcheck.skipReason,
      canTrade: false,
      skipReason: rugcheck.skipReason
    };
  }

  // Developer blacklist blocks trading
  if (devRisk.level === 'critical') {
    return {
      level: 'critical',
      warning: devRisk.warning,
      canTrade: false,
      skipReason: devRisk.warning || 'Developer is blacklisted'
    };
  }

  // High RugCheck score + developer risk = escalate
  if (rugcheck.normalised > 30 && devRisk.level === 'high') {
    return {
      level: 'critical',
      warning: `High dev risk + elevated RugCheck (${rugcheck.normalised}/100)`,
      canTrade: false,
      skipReason: 'Combined risk too high'
    };
  }

  // Developer high risk with RugCheck warnings
  if (devRisk.level === 'high' && rugcheck.adjustSellMultiplier) {
    return {
      level: 'high',
      warning: devRisk.warning || 'High risk developer with token concerns',
      canTrade: true,
      skipReason: null
    };
  }

  // RugCheck warnings elevate low/unknown to medium
  if (rugcheck.adjustSellMultiplier && (devRisk.level === 'low' || devRisk.level === 'unknown')) {
    return {
      level: 'medium',
      warning: 'Token has LP or concentration concerns',
      canTrade: true,
      skipReason: null
    };
  }

  // Otherwise use developer risk
  const riskConfig = RISK_CONFIG[devRisk.level as keyof typeof RISK_CONFIG] || RISK_CONFIG.unknown;
  return {
    level: devRisk.level,
    warning: devRisk.warning,
    canTrade: riskConfig.canTrade,
    skipReason: riskConfig.canTrade ? null : riskConfig.skipReason
  };
}

// ============================================================================
// DEVELOPER LOOKUP FUNCTIONS
// ============================================================================

async function findTokenCreator(tokenMint: string): Promise<string | null> {
  const heliusKey = getHeliusApiKey();
  if (!heliusKey) {
    console.warn('[developer-enrichment] HELIUS_API_KEY not set');
    return null;
  }

  try {
    const metadataUrl = getHeliusRestUrl('/v0/token-metadata');
    const response = await fetch(metadataUrl, {
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
    const txUrl = getHeliusRestUrl(`/v0/addresses/${tokenMint}/transactions`, { type: 'MINT' });
    const txResponse = await fetch(txUrl);
    
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

function cleanTwitterHandle(input: string): string | null {
  if (!input) return null;
  
  let handle = input
    .replace(/https?:\/\/(www\.)?(twitter|x)\.com\//gi, '')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '')
    .replace(/^@/, '');
  
  if (/^[a-zA-Z0-9_]{1,15}$/.test(handle)) {
    return handle;
  }
  
  return null;
}

async function findDeveloperByWallet(supabase: any, walletAddress: string): Promise<any> {
  const { data: profile } = await supabase
    .from('developer_profiles')
    .select('*')
    .eq('master_wallet_address', walletAddress)
    .single();

  if (profile) return profile;

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

async function createDeveloperProfile(supabase: any, walletAddress: string, twitterHandle: string | null): Promise<any> {
  const { data, error } = await supabase
    .from('developer_profiles')
    .insert({
      master_wallet_address: walletAddress,
      twitter_handle: twitterHandle,
      reputation_score: 50,
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

function calculateRiskLevel(profile: any): { level: string; warning: string | null } {
  if (profile.trust_level === 'blacklisted') {
    return {
      level: 'critical',
      warning: profile.blacklist_reason || 'Developer is blacklisted due to confirmed malicious activity'
    };
  }

  const rugCount = profile.rug_pull_count || 0;
  const slowDrainCount = profile.slow_drain_count || 0;
  const bundledWallets = profile.bundled_wallet_count || 0;
  const washTrading = profile.wash_trading_detected || false;
  const quickDumps = profile.quick_dump_count || 0;
  const reputationScore = profile.reputation_score || 50;

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

  if (slowDrainCount >= 2) {
    return {
      level: 'high',
      warning: `Developer has ${slowDrainCount} slow drain patterns detected`
    };
  }

  if (bundledWallets >= 3 && washTrading) {
    return {
      level: 'high',
      warning: `Suspicious activity: ${bundledWallets} bundled wallets + wash trading detected`
    };
  }

  if (quickDumps >= 3) {
    return {
      level: 'high',
      warning: `Developer frequently dumps tokens quickly (${quickDumps} instances)`
    };
  }

  if (slowDrainCount === 1 || bundledWallets >= 2 || quickDumps >= 2) {
    return {
      level: 'medium',
      warning: 'Some concerning patterns detected - proceed with caution'
    };
  }

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

  if (profile.trust_level === 'trusted' || profile.kyc_verified) {
    return {
      level: 'verified',
      warning: null
    };
  }

  if (reputationScore >= 70) {
    return {
      level: 'low',
      warning: null
    };
  }

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
