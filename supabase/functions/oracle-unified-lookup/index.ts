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
  // New fields for scan mode
  requiresScan?: boolean;
  scanMode?: 'deep' | 'quick' | 'spider';
  scanProgress?: string;
  liveAnalysis?: {
    pattern: string;
    tokensAnalyzed: number;
    graduatedTokens: number;
    successRate: number;
  };
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

function generateRecommendation(score: number, stats: OracleResult['stats'], requiresScan?: boolean): string {
  if (requiresScan) {
    return `⚠️ UNKNOWN DEVELOPER - Not in our database. Use "Deep Scan" to analyze their full token history from Pump.fun.`;
  }
  
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

// Fetch tokens from pump.fun for a wallet
async function fetchPumpfunTokens(walletAddress: string): Promise<any[]> {
  // Try multiple endpoints with proper headers
  const endpoints = [
    `https://frontend-api.pump.fun/coins/user-created-coins/${walletAddress}?limit=200&offset=0`,
    `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/user-created-coins/${walletAddress}?limit=200&offset=0`
  ];
  
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/'
  };
  
  for (const endpoint of endpoints) {
    try {
      console.log(`[Oracle] Trying pump.fun endpoint: ${endpoint.includes('frontend') ? 'frontend-api' : 'client-api'}`);
      
      const response = await fetch(endpoint, { headers });
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[Oracle] Found ${data.length} tokens from pump.fun`);
          return data;
        }
      } else {
        console.log(`[Oracle] Pump.fun API returned ${response.status}`);
      }
    } catch (error) {
      console.error(`[Oracle] Pump.fun fetch error:`, error);
    }
  }
  
  console.log('[Oracle] All pump.fun endpoints failed');
  return [];
}

// Quick analysis of pump.fun tokens
function quickAnalyzeTokens(tokens: any[]): { 
  totalTokens: number;
  graduated: number;
  successful: number;
  failed: number;
  rugged: number;
  pattern: string;
  successRate: number;
  avgMcap: number;
} {
  let graduated = 0, successful = 0, failed = 0, rugged = 0;
  let totalMcap = 0;
  
  for (const token of tokens) {
    const mcap = token.usd_market_cap || 0;
    const isComplete = token.complete === true;
    
    if (isComplete) {
      graduated++;
    } else if (mcap > 50000) {
      successful++;
    } else if (mcap < 1000) {
      failed++;
    } else if (mcap < 100) {
      rugged++;
    }
    
    totalMcap += mcap;
  }
  
  const totalTokens = tokens.length;
  const successRate = totalTokens > 0 ? ((graduated + successful) / totalTokens) * 100 : 0;
  const avgMcap = totalTokens > 0 ? totalMcap / totalTokens : 0;
  
  // Detect pattern
  let pattern = 'unknown';
  if (totalTokens >= 50 && successRate < 5) {
    pattern = 'serial_spammer';
  } else if (totalTokens >= 20 && successRate < 10) {
    pattern = 'fee_farmer';
  } else if (totalTokens <= 10 && successRate >= 30) {
    pattern = 'legitimate_builder';
  } else if (graduated > 0) {
    pattern = 'mixed_track_record';
  }
  
  return { totalTokens, graduated, successful, failed, rugged, pattern, successRate, avgMcap };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { input, scanMode } = await req.json();
    
    if (!input || typeof input !== 'string') {
      throw new Error('Input string required (token address, wallet, or @X handle)');
    }

    const cleanedInput = input.trim().replace(/^@/, '');
    const inputType = detectInputType(input);
    console.log(`[Oracle] Processing input: ${cleanedInput}, type: ${inputType}, scanMode: ${scanMode || 'none'}`);

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

    // Check if we have any data on this developer
    const hasExistingData = !!(developerProfile || devWalletRep || blacklistEntry || whitelistEntry || developerTokens.length > 0);
    
    // If no data and no scan mode requested, offer scan options
    if (!hasExistingData && !scanMode && resolvedWallet) {
      console.log('[Oracle] No existing data found, offering scan options...');
      
      // Try to get pump.fun data (may fail due to rate limits)
      const pumpfunTokens = await fetchPumpfunTokens(resolvedWallet);
      
      if (pumpfunTokens.length > 0) {
        // They ARE a developer with data from pump.fun
        const quickStats = quickAnalyzeTokens(pumpfunTokens);
        console.log(`[Oracle] Found ${pumpfunTokens.length} tokens on pump.fun, pattern: ${quickStats.pattern}`);
        
        return new Response(
          JSON.stringify({
            found: false,
            requiresScan: true,
            inputType,
            resolvedWallet,
            score: 50,
            trafficLight: 'UNKNOWN' as const,
            stats: {
              totalTokens: quickStats.totalTokens,
              successfulTokens: quickStats.graduated + quickStats.successful,
              failedTokens: quickStats.failed,
              rugPulls: quickStats.rugged,
              slowDrains: 0,
              avgLifespanHours: 0
            },
            network: { linkedWallets: [], linkedXAccounts: [], sharedMods: [], relatedTokens: [] },
            blacklistStatus: { isBlacklisted: false, linkedEntities: [] },
            whitelistStatus: { isWhitelisted: false },
            recommendation: `⚠️ UNKNOWN DEVELOPER with ${quickStats.totalTokens} tokens on Pump.fun. Pattern detected: ${quickStats.pattern.replace(/_/g, ' ')}. Run a scan to add them to the database and get full analysis.`,
            meshLinksAdded: 0,
            liveAnalysis: {
              pattern: quickStats.pattern,
              tokensAnalyzed: quickStats.totalTokens,
              graduatedTokens: quickStats.graduated,
              successRate: quickStats.successRate
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        // Pump.fun API failed or no tokens - still offer scan option
        console.log('[Oracle] Pump.fun API unavailable, offering manual scan option');
        return new Response(
          JSON.stringify({
            found: false,
            requiresScan: true,
            inputType,
            resolvedWallet,
            score: 50,
            trafficLight: 'UNKNOWN' as const,
            stats: { totalTokens: 0, successfulTokens: 0, failedTokens: 0, rugPulls: 0, slowDrains: 0, avgLifespanHours: 0 },
            network: { linkedWallets: [], linkedXAccounts: [], sharedMods: [], relatedTokens: [] },
            blacklistStatus: { isBlacklisted: false, linkedEntities: [] },
            whitelistStatus: { isWhitelisted: false },
            recommendation: `⚠️ UNKNOWN DEVELOPER - Not in our database. Click "Deep Scan" to fetch their full token history from Pump.fun and analyze their track record.`,
            meshLinksAdded: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }
    
    // If scan mode was requested, run the pumpfun-dev-analyzer
    if (scanMode && resolvedWallet) {
      console.log(`[Oracle] Running ${scanMode} scan for ${resolvedWallet}`);
      
      try {
        const { data: analyzerResult, error: analyzerError } = await supabase.functions.invoke('pumpfun-dev-analyzer', {
          body: { 
            action: 'analyze',
            walletAddress: resolvedWallet
          }
        });
        
        if (analyzerError) {
          console.error('[Oracle] Dev analyzer error:', analyzerError);
        } else if (analyzerResult?.analysis) {
          const analysis = analyzerResult.analysis;
          
          // Build result from fresh analysis
          const stats: OracleResult['stats'] = {
            totalTokens: analysis.totalTokens || 0,
            successfulTokens: (analysis.graduatedTokens || 0) + (analysis.successfulTokens || 0),
            failedTokens: analysis.failedTokens || 0,
            rugPulls: analysis.ruggedTokens || 0,
            slowDrains: 0,
            avgLifespanHours: analysis.avgLifespanMins ? analysis.avgLifespanMins / 60 : 0
          };
          
          const score = analysis.reputationScore || 50;
          const trafficLight = getTrafficLight(score);
          
          // Get pattern-specific recommendation
          let recommendation = '';
          switch (analysis.pattern) {
            case 'serial_spammer':
              recommendation = `🔴 SERIAL SPAMMER - ${stats.totalTokens} tokens launched with ${analysis.successRatePct?.toFixed(1)}% success rate. This developer mass-produces tokens. AVOID.`;
              break;
            case 'fee_farmer':
              recommendation = `🔴 FEE FARMER - Creates many low-effort tokens, likely farming creation fees. High risk of abandonment.`;
              break;
            case 'test_launcher':
              recommendation = `🟡 TEST LAUNCHER - Reuses token names, testing before real launches. Check their graduated tokens for legitimacy.`;
              break;
            case 'legitimate_builder':
              recommendation = `🟢 LEGITIMATE BUILDER - Few tokens with good success rate. More likely to be a serious project.`;
              break;
            default:
              recommendation = generateRecommendation(score, stats);
          }
          
          return new Response(
            JSON.stringify({
              found: true,
              inputType,
              resolvedWallet,
              score,
              trafficLight,
              stats,
              network: {
                linkedWallets: [],
                linkedXAccounts: [],
                sharedMods: [],
                relatedTokens: (analysis.tokens || []).slice(0, 10).map((t: any) => t.symbol || t.name || t.mint?.slice(0, 8))
              },
              blacklistStatus: { isBlacklisted: false, linkedEntities: [] },
              whitelistStatus: { isWhitelisted: false },
              recommendation,
              meshLinksAdded: 0,
              scanMode,
              liveAnalysis: {
                pattern: analysis.pattern,
                tokensAnalyzed: analysis.totalTokens,
                graduatedTokens: analysis.graduatedTokens,
                successRate: analysis.successRatePct
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      } catch (e) {
        console.error('[Oracle] Dev analyzer invocation failed:', e);
      }
    }

    // Calculate stats from existing data
    const stats: OracleResult['stats'] = {
      totalTokens: developerProfile?.total_tokens_created || devWalletRep?.total_tokens_launched || developerTokens.length || 0,
      successfulTokens: developerProfile?.successful_tokens || devWalletRep?.tokens_successful || developerTokens.filter(t => t.outcome === 'success').length || 0,
      failedTokens: developerProfile?.failed_tokens || devWalletRep?.tokens_rugged || developerTokens.filter(t => t.outcome === 'failed').length || 0,
      rugPulls: developerProfile?.rug_pull_count || devWalletRep?.rug_pull_count || 0,
      slowDrains: developerProfile?.slow_drain_count || devWalletRep?.slow_drain_count || 0,
      avgLifespanHours: developerProfile?.avg_token_lifespan_hours || 0
    };

    // Calculate score and traffic light
    const isBlacklisted = !!blacklistEntry;
    const isWhitelisted = !!whitelistEntry;
    const score = calculateScore(stats, isBlacklisted, isWhitelisted);
    const trafficLight = getTrafficLight(score);
    const recommendation = generateRecommendation(score, stats, !hasExistingData);

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
      found: hasExistingData,
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
