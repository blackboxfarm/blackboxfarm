import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from '../_shared/helius-client.ts';
import { solscanFullIntelSweep, solscanResolveTokenCreator, solscanDiscoverFunders } from '../_shared/solscan-intelligence.ts';
enableHeliusTracking('oracle-unified-lookup');

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
  scoreBreakdown: {
    base: number;
    rugPullPenalty: number;
    slowDrainPenalty: number;
    failedTokenPenalty: number;
    lowLifespanPenalty: number;
    blacklistPenalty: number;
    successBonus: number;
    whitelistBonus: number;
    consistencyBonus: number;
    final: number;
  };
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
    meshLinks: Array<{
      sourceType: string;
      sourceId: string;
      linkedType: string;
      linkedId: string;
      relationship: string;
      confidence: number;
      discoveredVia?: string;
    }>;
  };
  tokenHistory: Array<{
    mint: string;
    symbol: string;
    outcome: string;
    isActive: boolean;
    creatorWallet?: string;
  }>;
  upstreamChain?: Array<{
    wallet: string;
    role: string;
    relationship: string;
  }>;
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

function parseXUrl(input: string): string | null {
  const xUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(@?[\w]+)\/?(?:\?.*)?$/i;
  const match = input.match(xUrlPattern);
  if (match) return match[1].replace('@', '');
  return null;
}

function detectInputType(input: string): 'token' | 'wallet' | 'x_account' | 'unknown' {
  const cleaned = input.trim();
  
  // Check for X/Twitter URLs first
  if (parseXUrl(cleaned)) {
    return 'x_account';
  }
  
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

function calculateScore(stats: OracleResult['stats'], blacklisted: boolean, whitelisted: boolean): { score: number; breakdown: OracleResult['scoreBreakdown'] } {
  const base = 50;
  const rugPullPenalty = (stats.rugPulls || 0) * 30;
  const slowDrainPenalty = (stats.slowDrains || 0) * 20;
  const failedTokenPenalty = (stats.failedTokens || 0) * 5;
  const lowLifespanPenalty = (stats.avgLifespanHours < 24 && stats.totalTokens > 0) ? 15 : 0;
  const blacklistPenalty = blacklisted ? 30 : 0;
  const successBonus = (stats.successfulTokens || 0) * 15;
  const whitelistBonus = whitelisted ? 20 : 0;
  const consistencyBonus = (stats.totalTokens > 5 && stats.successfulTokens / stats.totalTokens > 0.5) ? 15 : 0;
  
  const raw = base - rugPullPenalty - slowDrainPenalty - failedTokenPenalty - lowLifespanPenalty - blacklistPenalty + successBonus + whitelistBonus + consistencyBonus;
  const final = Math.max(0, Math.min(100, raw));
  
  return {
    score: final,
    breakdown: {
      base,
      rugPullPenalty: -rugPullPenalty,
      slowDrainPenalty: -slowDrainPenalty,
      failedTokenPenalty: -failedTokenPenalty,
      lowLifespanPenalty: -lowLifespanPenalty,
      blacklistPenalty: -blacklistPenalty,
      successBonus,
      whitelistBonus,
      consistencyBonus,
      final
    }
  };
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

// Fetch tokens MINTED by a wallet — only returns tokens this wallet actually created
async function fetchPumpfunTokens(walletAddress: string, supabase: any, apiErrors: string[] = []): Promise<any[]> {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/'
  };
  
  let allTokens: any[] = [];
  
  // STEP 1: Pump.fun user-created-coins API (ONLY returns tokens this wallet minted)
  const baseEndpoints = [
    `https://frontend-api-v3.pump.fun/coins/user-created-coins/${walletAddress}`,
    `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/user-created-coins/${walletAddress}`
  ];
  
  for (const baseUrl of baseEndpoints) {
    let offset = 0;
    const limit = 100;
    let keepFetching = true;
    
    try {
      while (keepFetching) {
        const url = `${baseUrl}?limit=${limit}&offset=${offset}&includeNsfw=true`;
        console.log(`[Oracle] Fetching created tokens offset=${offset}...`);
        
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            allTokens = allTokens.concat(data);
            console.log(`[Oracle] Got ${data.length} minted tokens (total: ${allTokens.length})`);
            
            if (data.length < limit) {
              keepFetching = false;
            } else {
              offset += limit;
              if (offset >= 1000) keepFetching = false;
            }
          } else {
            keepFetching = false;
          }
        } else {
          const errMsg = `Pump.fun API ${response.status} on ${baseUrl.includes('frontend') ? 'frontend-api' : 'client-api'}`;
          console.log(`[Oracle] ${errMsg}`);
          apiErrors.push(errMsg);
          keepFetching = false;
        }
      }
      
      if (allTokens.length > 0) {
        console.log(`[Oracle] Total minted tokens from pump.fun API: ${allTokens.length}`);
        return allTokens;
      }
    } catch (error) {
      const errMsg = `Pump.fun fetch error: ${error instanceof Error ? error.message : 'timeout'}`;
      console.error(`[Oracle] ${errMsg}`);
      apiErrors.push(errMsg);
    }
  }
  
  // STEP 2: Helius TOKEN_MINT transaction history (on-chain proof of minting)
  console.log('[Oracle] Pump.fun API unavailable. Trying Helius TOKEN_MINT transactions...');
  try {
    const heliusKey = getHeliusApiKey();
    if (heliusKey) {
      const txHistoryUrl = getHeliusRestUrl(`/v0/addresses/${walletAddress}/transactions`, { type: 'TOKEN_MINT', limit: '100' });
      
      let allMints: string[] = [];
      let currentUrl = txHistoryUrl;
      let pageCount = 0;
      
      while (currentUrl && pageCount < 10) {
        console.log(`[Oracle] Fetching Helius TOKEN_MINT page ${pageCount + 1}...`);
        const response = await fetch(currentUrl, { signal: AbortSignal.timeout(10000) });
        
        if (response.ok) {
          const transactions = await response.json();
          
          if (Array.isArray(transactions) && transactions.length > 0) {
            for (const tx of transactions) {
              const transfers = tx.tokenTransfers || [];
              for (const transfer of transfers) {
                if (transfer.mint && !allMints.includes(transfer.mint)) {
                  allMints.push(transfer.mint);
                }
              }
              
              const instructions = tx.instructions || [];
              for (const instr of instructions) {
                if (instr.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                  const accounts = instr.accounts || [];
                  if (accounts.length > 0 && !allMints.includes(accounts[0])) {
                    allMints.push(accounts[0]);
                  }
                }
              }
            }
            
            if (transactions.length < 100) break;
            
            const lastTx = transactions[transactions.length - 1];
            if (lastTx?.signature) {
              currentUrl = getHeliusRestUrl(`/v0/addresses/${walletAddress}/transactions`, { type: 'TOKEN_MINT', limit: '100', before: lastTx.signature });
              pageCount++;
            } else {
              break;
            }
          } else {
            break;
          }
        } else {
          console.log(`[Oracle] Helius tx history returned ${response.status}`);
          break;
        }
      }
      
      if (allMints.length > 0) {
        console.log(`[Oracle] Helius found ${allMints.length} MINTED tokens in transaction history`);
        return allMints.map((mint: string) => ({
          mint,
          name: 'Unknown',
          symbol: '???',
          complete: false,
          usd_market_cap: 0,
          creator: walletAddress // Helius TOKEN_MINT confirms this wallet minted it
        }));
      }
      
      // STEP 3: Helius DAS getAssetsByCreator
      console.log('[Oracle] Trying Helius DAS getAssetsByCreator...');
      const heliusRpcUrl = getHeliusRpcUrl(heliusKey);
      
      const dasResponse = await fetch(heliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'oracle-das',
          method: 'getAssetsByCreator',
          params: {
            creatorAddress: walletAddress,
            page: 1,
            limit: 1000
          }
        }),
        signal: AbortSignal.timeout(10000)
      });
      
      if (dasResponse.ok) {
        const result = await dasResponse.json();
        const items = result?.result?.items || [];
        
        if (items.length > 0) {
          console.log(`[Oracle] Helius DAS found ${items.length} created assets`);
          return items.map((item: any) => ({
            mint: item.id,
            name: item.content?.metadata?.name || 'Unknown',
            symbol: item.content?.metadata?.symbol || '???',
            complete: false,
            usd_market_cap: 0,
            creator: walletAddress
          }));
        }
      }
    } else {
      console.log('[Oracle] No HELIUS_API_KEY configured');
      apiErrors.push('Helius API key not configured');
    }
  } catch (error) {
    const errMsg = `Helius error: ${error instanceof Error ? error.message : 'unknown'}`;
    console.error(`[Oracle] ${errMsg}`);
    apiErrors.push(errMsg);
  }
  
  // STEP 4: Local DB cache (only tokens we've previously verified as created by this wallet)
  console.log('[Oracle] Checking local DB for cached minted tokens...');
  try {
    const { data: cachedTokens } = await supabase
      .from('developer_tokens')
      .select('token_mint, token_symbol, outcome, peak_market_cap_usd, is_active')
      .eq('creator_wallet', walletAddress)
      .limit(500);
    
    if (cachedTokens && cachedTokens.length > 0) {
      console.log(`[Oracle] Found ${cachedTokens.length} cached minted tokens in DB`);
      return cachedTokens.map((t: any) => ({
        mint: t.token_mint,
        symbol: t.token_symbol || '???',
        name: t.token_symbol || 'Unknown',
        complete: t.outcome === 'graduated',
        usd_market_cap: t.peak_market_cap_usd || 0,
        creator: walletAddress
      }));
    }
  } catch (error) {
    console.error('[Oracle] DB lookup error:', error);
  }
  
  console.log('[Oracle] All mint-lookup methods exhausted — no tokens found');
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
  } else if (totalTokens > 0 && totalTokens <= 10 && successRate < 30) {
    pattern = 'low_success_newcomer';
  } else if (totalTokens > 10 && totalTokens < 20) {
    pattern = 'moderate_launcher';
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

    // Parse X URLs before cleaning
    const xHandle = parseXUrl(input.trim());
    const cleanedInput = xHandle ? xHandle : input.trim().replace(/^@/, '');
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
      // Full fallback chain: token_lifecycle -> pumpfun_watchlist -> developer_tokens -> pump.fun API
      
      // 1. token_lifecycle
      const { data: lifecycle } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet, developer_id')
        .eq('token_mint', cleanedInput)
        .maybeSingle();
      
      if (lifecycle?.creator_wallet) {
        resolvedWallet = lifecycle.creator_wallet;
        console.log(`[Oracle] Resolved via token_lifecycle: ${resolvedWallet?.slice(0, 8)}`);
      }
      
      // 2. pumpfun_watchlist
      if (!resolvedWallet) {
        const { data: watchlistToken } = await supabase
          .from('pumpfun_watchlist')
          .select('creator_wallet, token_name, token_symbol')
          .eq('token_mint', cleanedInput)
          .maybeSingle();
        
        if (watchlistToken?.creator_wallet) {
          resolvedWallet = watchlistToken.creator_wallet;
          console.log(`[Oracle] Resolved via pumpfun_watchlist: ${resolvedWallet?.slice(0, 8)}`);
        }
      }
      
      // 3. developer_tokens
      if (!resolvedWallet) {
        const { data: devToken } = await supabase
          .from('developer_tokens')
          .select('creator_wallet')
          .eq('token_mint', cleanedInput)
          .maybeSingle();
        
        if (devToken?.creator_wallet) {
          resolvedWallet = devToken.creator_wallet;
          console.log(`[Oracle] Resolved via developer_tokens: ${resolvedWallet?.slice(0, 8)}`);
        }
      }
      
      // 4. pump.fun API
      if (!resolvedWallet) {
        try {
          const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${cleanedInput}`, {
            headers: { 'Accept': 'application/json' }
          });
          if (pfRes.ok) {
            const pfData = await pfRes.json();
            if (pfData?.creator) {
              resolvedWallet = pfData.creator;
              console.log(`[Oracle] Resolved via pump.fun API: ${resolvedWallet?.slice(0, 8)}`);
            }
          }
        } catch (e) {
          console.log('[Oracle] Pump.fun API failed:', e);
        }
      }
      
      // 5. Try token-creator-linker as last resort
      if (!resolvedWallet) {
        try {
          await supabase.functions.invoke('token-creator-linker', {
            body: { tokenMints: [cleanedInput] }
          });
          const { data: updatedLifecycle } = await supabase
            .from('token_lifecycle')
            .select('creator_wallet')
            .eq('token_mint', cleanedInput)
            .maybeSingle();
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
      
      // Blacklist check - query by identifier (wallet/token/handle) and linked_wallets
      // Also check original token mint if input was a token
      supabase
        .from('pumpfun_blacklist')
        .select('*')
        .or(`identifier.eq.${resolvedWallet},linked_wallets.cs.{${resolvedWallet}}${inputType === 'token' && cleanedInput !== resolvedWallet ? `,identifier.eq.${cleanedInput}` : ''}`)
        .limit(5),
      
      // Whitelist check - query by identifier and linked_wallets
      supabase
        .from('pumpfun_whitelist')
        .select('*')
        .or(`identifier.eq.${resolvedWallet},linked_wallets.cs.{${resolvedWallet}}${inputType === 'token' && cleanedInput !== resolvedWallet ? `,identifier.eq.${cleanedInput}` : ''}`)
        .limit(5),
      
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
    
    // AUTO-SPIDER: Always fetch from pump.fun and write to DB on every lookup
    let liveTokens: any[] = [];
    let liveAnalysis: any = null;
    const apiErrors: string[] = [];
    
    if (resolvedWallet) {
      console.log('[Oracle] Auto-spider: fetching tokens from Pump.fun...');
      liveTokens = await fetchPumpfunTokens(resolvedWallet, supabase, apiErrors);
      
      if (liveTokens.length > 0) {
        const quickStats = quickAnalyzeTokens(liveTokens);
        console.log(`[Oracle] Found ${liveTokens.length} tokens, pattern: ${quickStats.pattern}`);
        
        liveAnalysis = {
          pattern: quickStats.pattern,
          tokensAnalyzed: quickStats.totalTokens,
          graduatedTokens: quickStats.graduated,
          successRate: quickStats.successRate
        };
        
        // Write to dev_wallet_reputation
        await supabase
          .from('dev_wallet_reputation')
          .upsert({
            wallet_address: resolvedWallet,
            total_tokens_launched: quickStats.totalTokens,
            tokens_graduated: quickStats.graduated,
            tokens_successful: quickStats.successful,
            tokens_rugged: quickStats.rugged,
            success_rate_pct: quickStats.successRate,
            dev_pattern: quickStats.pattern,
            is_serial_spammer: quickStats.pattern === 'serial_spammer',
            is_test_launcher: quickStats.pattern === 'test_launcher',
            is_legitimate_builder: quickStats.pattern === 'legitimate_builder',
            last_analyzed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'wallet_address' });
        
        console.log(`[Oracle] Updated dev_wallet_reputation for ${resolvedWallet.slice(0, 8)}...`);
        
        // Write individual tokens to developer_tokens (first 200)
        // Use the token's actual creator field from pump.fun API if available
        const tokenUpserts = liveTokens.slice(0, 200).map((token: any) => ({
          token_mint: token.mint,
          creator_wallet: token.creator || resolvedWallet, // Prefer actual creator from pump.fun
          developer_id: resolvedWallet, // developer_id tracks the network root
          token_symbol: token.symbol,
          is_active: token.usd_market_cap > 1000,
          outcome: token.complete ? 'graduated' : (token.usd_market_cap > 50000 ? 'success' : (token.usd_market_cap < 100 ? 'failed' : 'unknown')),
          peak_market_cap_usd: token.usd_market_cap || 0,
          launch_date: token.created_timestamp || new Date().toISOString(),
          launchpad: 'pumpfun'
        }));
        
        if (tokenUpserts.length > 0) {
          await supabase
            .from('developer_tokens')
            .upsert(tokenUpserts, { onConflict: 'token_mint' });
          console.log(`[Oracle] Upserted ${tokenUpserts.length} tokens to developer_tokens`);
        }
      }
    }
    
    // If no existing data AND no live tokens found, offer scan options
    if (!hasExistingData && liveTokens.length === 0 && resolvedWallet) {
      console.log('[Oracle] No data found anywhere, offering scan options...');
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
          recommendation: `⚠️ UNKNOWN DEVELOPER - Could not fetch data from Pump.fun or Helius. Try "Deep Scan" for manual analysis.`,
          meshLinksAdded: 0,
          apiErrors
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    // If scan mode was requested, run the pumpfun-dev-analyzer for deeper analysis
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
          
          // Check blacklist/whitelist status for scan-mode results too
          const isBlacklistedScan = !!blacklistEntry;
          const isWhitelistedScan = !!whitelistEntry;
          const finalScore = isBlacklistedScan ? Math.min(score, 10) : score;
          const finalTrafficLight = isBlacklistedScan ? 'RED' : getTrafficLight(finalScore);

          return new Response(
            JSON.stringify({
              found: true,
              inputType,
              resolvedWallet,
              score: finalScore,
              trafficLight: finalTrafficLight,
              stats,
              network: {
                linkedWallets: [],
                linkedXAccounts: [],
                sharedMods: [],
                relatedTokens: (analysis.tokens || []).slice(0, 10).map((t: any) => t.symbol || t.name || t.mint?.slice(0, 8))
              },
              blacklistStatus: { 
                isBlacklisted: isBlacklistedScan, 
                reason: blacklistEntry?.blacklist_reason,
                linkedEntities: blacklistEntry?.linked_wallets || [] 
              },
              whitelistStatus: { 
                isWhitelisted: isWhitelistedScan,
                reason: whitelistEntry?.whitelist_reason 
              },
              recommendation: isBlacklistedScan 
                ? `🚫 BLACKLISTED - ${blacklistEntry?.blacklist_reason || 'Known bad actor'}. ${recommendation}`
                : recommendation,
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

    // Calculate stats - prefer live data if available, otherwise use DB
    const stats: OracleResult['stats'] = {
      totalTokens: liveAnalysis?.tokensAnalyzed || developerProfile?.total_tokens_created || devWalletRep?.total_tokens_launched || developerTokens.length || 0,
      successfulTokens: liveAnalysis?.graduatedTokens || developerProfile?.successful_tokens || devWalletRep?.tokens_successful || developerTokens.filter(t => t.outcome === 'success').length || 0,
      failedTokens: developerProfile?.failed_tokens || devWalletRep?.tokens_rugged || developerTokens.filter(t => t.outcome === 'failed').length || 0,
      rugPulls: developerProfile?.rug_pull_count || devWalletRep?.rug_pull_count || 0,
      slowDrains: developerProfile?.slow_drain_count || devWalletRep?.slow_drain_count || 0,
      avgLifespanHours: developerProfile?.avg_token_lifespan_hours || 0
    };

    // Calculate score and traffic light
    const isBlacklisted = !!blacklistEntry;
    const isWhitelisted = !!whitelistEntry;
    const { score, breakdown: scoreBreakdown } = calculateScore(stats, isBlacklisted, isWhitelisted);
    const trafficLight = getTrafficLight(score);
    const recommendation = generateRecommendation(score, stats, !hasExistingData);

    // Process mesh links into structured data
    const processedMeshLinks = meshLinks.map((link: any) => ({
      sourceType: link.source_type,
      sourceId: link.source_id,
      linkedType: link.linked_type,
      linkedId: link.linked_id,
      relationship: link.relationship,
      confidence: link.confidence || 0,
      discoveredVia: link.discovered_via
    }));

    // Extract upstream wallets from mesh (funded_by, same_kyc_root, etc.)
    const upstreamWallets = meshLinks
      .filter((link: any) => 
        ['funded_by', 'same_kyc_root', 'directly_funded', 'satellite_of'].includes(link.relationship) &&
        link.linked_id !== resolvedWallet
      )
      .map((link: any) => link.linked_id);
    
    // Extract linked wallets from mesh
    const meshLinkedWallets = meshLinks
      .filter((link: any) => 
        (link.source_type === 'wallet' || link.linked_type === 'wallet') &&
        link.source_id !== resolvedWallet && link.linked_id !== resolvedWallet
      )
      .map((link: any) => link.source_id === resolvedWallet ? link.linked_id : link.source_id)
      .filter((w: string) => isBase58(w));

    // Build network associations - now including mesh data
    const allLinkedWallets = [...new Set([
      ...(xAccountData?.linkedWallets || []),
      ...upstreamWallets,
      ...meshLinkedWallets
    ])];

    const network: OracleResult['network'] = {
      linkedWallets: allLinkedWallets,
      linkedXAccounts: xAccountData?.linkedXAccounts || developerProfile?.twitter_handle ? [developerProfile.twitter_handle] : [],
      sharedMods: xAccountData?.sharedMods || [],
      relatedTokens: developerTokens.map(t => t.token_symbol || t.token_mint).slice(0, 10),
      devTeam: devTeam ? { id: devTeam.id, name: devTeam.team_name } : undefined,
      meshLinks: processedMeshLinks
    };

    // Build token history — merge live tokens with DB tokens, prefer live data for symbols
    const liveTokenMap = new Map<string, any>();
    for (const lt of liveTokens) {
      if (lt.mint) liveTokenMap.set(lt.mint, lt);
    }
    
    // Start with DB tokens, enrich with live data
    const dbTokenMap = new Map<string, any>();
    for (const t of developerTokens) {
      const live = liveTokenMap.get(t.token_mint);
      dbTokenMap.set(t.token_mint, {
        mint: t.token_mint,
        symbol: (live?.symbol && live.symbol !== '???' ? live.symbol : null) || (t.token_symbol && t.token_symbol !== '???' ? t.token_symbol : null) || (live?.name && live.name !== 'Unknown' ? live.name : null) || '???',
        name: live?.name || t.token_symbol || 'Unknown',
        outcome: t.outcome || (live?.complete ? 'graduated' : 'unknown'),
        isActive: t.is_active ?? false,
        mcap: live?.usd_market_cap || 0,
        creatorWallet: live?.creator || null // Don't default to resolvedWallet yet
      });
    }
    
    // Add any live tokens not in DB
    for (const lt of liveTokens) {
      if (lt.mint && !dbTokenMap.has(lt.mint)) {
        dbTokenMap.set(lt.mint, {
          mint: lt.mint,
          symbol: (lt.symbol && lt.symbol !== '???') ? lt.symbol : (lt.name && lt.name !== 'Unknown' ? lt.name : '???'),
          name: lt.name || 'Unknown',
          outcome: lt.complete ? 'graduated' : (lt.usd_market_cap > 50000 ? 'success' : (lt.usd_market_cap < 100 ? 'failed' : 'unknown')),
          isActive: lt.usd_market_cap > 1000,
          mcap: lt.usd_market_cap || 0,
          creatorWallet: lt.creator || null
        });
      }
    }
    
    // RESOLVE REAL CREATORS: batch-lookup from token_lifecycle for tokens missing creator
    const tokenMints = Array.from(dbTokenMap.keys());
    const mintsNeedingCreator = tokenMints.filter(mint => !dbTokenMap.get(mint)?.creatorWallet);
    
    if (mintsNeedingCreator.length > 0) {
      console.log(`[Oracle] Resolving real creators for ${mintsNeedingCreator.length} tokens via token_lifecycle...`);
      
      // Batch query token_lifecycle (max 50 at a time)
      for (let i = 0; i < mintsNeedingCreator.length; i += 50) {
        const batch = mintsNeedingCreator.slice(i, i + 50);
        const { data: lifecycleData } = await supabase
          .from('token_lifecycle')
          .select('token_mint, creator_wallet')
          .in('token_mint', batch);
        
        if (lifecycleData) {
          for (const lc of lifecycleData) {
            const entry = dbTokenMap.get(lc.token_mint);
            if (entry && lc.creator_wallet) {
              entry.creatorWallet = lc.creator_wallet;
            }
          }
        }
      }
    }
    
    // For remaining tokens still without creator, try pump.fun API (max 5 to avoid rate limits)
    const stillMissingCreator = tokenMints.filter(mint => !dbTokenMap.get(mint)?.creatorWallet).slice(0, 5);
    if (stillMissingCreator.length > 0) {
      console.log(`[Oracle] Fetching creators from pump.fun API for ${stillMissingCreator.length} tokens...`);
      
      const pfCreatorPromises = stillMissingCreator.map(async (mint) => {
        try {
          const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.creator) {
              const entry = dbTokenMap.get(mint);
              if (entry) entry.creatorWallet = data.creator;
            }
          }
        } catch (e) {
          // Ignore individual failures
        }
      });
      
      await Promise.all(pfCreatorPromises);
    }
    
    // Build per-token upstream chains from mesh data
    for (const [mint, tokenEntry] of dbTokenMap.entries()) {
      const creator = tokenEntry.creatorWallet;
      if (!creator || creator === resolvedWallet) continue;
      
      // Find mesh links connecting this creator to the resolvedWallet
      const tokenChain: Array<{ wallet: string; role: string; relationship: string }> = [];
      const chainVisited = new Set<string>([creator]);
      let chainWallet = creator;
      let chainDepth = 0;
      
      while (chainWallet && chainWallet !== resolvedWallet && chainDepth < 4) {
        const upLink = meshLinks.find((link: any) => {
          if (['funded_by', 'directly_funded', 'satellite_of', 'same_kyc_root', 'kyc_root'].includes(link.relationship)) {
            if (link.source_id === chainWallet && !chainVisited.has(link.linked_id) && isBase58(link.linked_id)) return true;
            if (['directly_funded', 'funds'].includes(link.relationship) && 
                link.linked_id === chainWallet && !chainVisited.has(link.source_id) && isBase58(link.source_id)) return true;
          }
          return false;
        });
        
        if (!upLink) break;
        
        const nextW = upLink.source_id === chainWallet ? upLink.linked_id : upLink.source_id;
        chainVisited.add(nextW);
        
        let chainRole = 'intermediary';
        if (['same_kyc_root', 'kyc_root'].includes(upLink.relationship)) chainRole = 'kyc_root';
        else if (['funded_by', 'directly_funded', 'satellite_of'].includes(upLink.relationship)) chainRole = 'funder';
        
        tokenChain.push({ wallet: nextW, role: chainRole, relationship: upLink.relationship });
        chainWallet = nextW;
        chainDepth++;
      }
      
      // If we didn't reach resolvedWallet but it's known to be upstream, add it
      if (chainWallet !== resolvedWallet && resolvedWallet) {
        tokenChain.push({ wallet: resolvedWallet, role: 'kyc_root', relationship: 'parent_wallet' });
      }
      
      tokenEntry.upstreamChain = tokenChain;
    }
    
    const tokenHistory = Array.from(dbTokenMap.values());
    
    // Build upstream wallet chain from mesh for display
    // Walk from resolvedWallet → funder → funder → KYC root
    const upstreamChain: Array<{ wallet: string; role: string; relationship: string }> = [];
    const visited = new Set<string>();
    let currentWallet = resolvedWallet;
    
    // Add the direct creator/subject first
    if (currentWallet) {
      upstreamChain.push({ wallet: currentWallet, role: 'creator', relationship: 'subject' });
      visited.add(currentWallet);
    }
    
    // Walk upstream through mesh
    const fundingRelationships = ['funded_by', 'directly_funded', 'satellite_of', 'same_kyc_root', 'kyc_root'];
    let depth = 0;
    const maxChainDepth = 5;
    
    while (currentWallet && depth < maxChainDepth) {
      const upstreamLink = meshLinks.find((link: any) => {
        // Find links where currentWallet is the source (child) pointing to a parent
        if (fundingRelationships.includes(link.relationship)) {
          if (link.source_id === currentWallet && !visited.has(link.linked_id) && isBase58(link.linked_id)) {
            return true;
          }
          // Also check reverse direction for some relationships
          if (['directly_funded', 'funds'].includes(link.relationship) && 
              link.linked_id === currentWallet && !visited.has(link.source_id) && isBase58(link.source_id)) {
            return true;
          }
        }
        return false;
      });
      
      if (!upstreamLink) break;
      
      const nextWallet = upstreamLink.source_id === currentWallet ? upstreamLink.linked_id : upstreamLink.source_id;
      visited.add(nextWallet);
      
      // Determine role based on relationship and position
      let role = 'intermediary';
      if (['same_kyc_root', 'kyc_root'].includes(upstreamLink.relationship)) {
        role = 'kyc_root';
      } else if (['funded_by', 'directly_funded', 'satellite_of'].includes(upstreamLink.relationship)) {
        role = 'funder';
      }
      
      upstreamChain.push({ 
        wallet: nextWallet, 
        role, 
        relationship: upstreamLink.relationship 
      });
      
      currentWallet = nextWallet;
      depth++;
    }

    // Store ALL discovered mesh links — full family tree
    let meshLinksAdded = 0;
    const newLinks: any[] = [];

    // 1. Input token → creator wallet
    if (resolvedWallet && inputType === 'token') {
      newLinks.push({
        source_type: 'wallet',
        source_id: resolvedWallet,
        linked_type: 'token',
        linked_id: cleanedInput,
        relationship: 'created',
        confidence: 100,
        discovered_via: 'oracle_spider'
      });
    }

    // 2. X account → wallet
    if (resolvedWallet && inputType === 'x_account') {
      newLinks.push({
        source_type: 'x_account',
        source_id: cleanedInput,
        linked_type: 'wallet',
        linked_id: resolvedWallet,
        relationship: 'linked',
        confidence: 80,
        discovered_via: 'oracle_spider'
      });
    }

    // 3. ALL tokens created by this dev → mesh links
    if (resolvedWallet && liveTokens.length > 0) {
      for (const token of liveTokens.slice(0, 100)) {
        if (token.mint && token.mint !== cleanedInput) {
          newLinks.push({
            source_type: 'wallet',
            source_id: resolvedWallet,
            linked_type: 'token',
            linked_id: token.mint,
            relationship: 'created',
            confidence: 95,
            discovered_via: 'oracle_spider'
          });
        }
      }
    }

    // 4. Upstream funding chain → mesh links (dev→funder→KYC root)
    if (upstreamChain.length > 1) {
      for (let i = 0; i < upstreamChain.length - 1; i++) {
        const child = upstreamChain[i];
        const parent = upstreamChain[i + 1];
        if (child.wallet && parent.wallet && child.wallet !== parent.wallet) {
          newLinks.push({
            source_type: 'wallet',
            source_id: child.wallet,
            linked_type: 'wallet',
            linked_id: parent.wallet,
            relationship: parent.relationship || 'funded_by',
            confidence: 85,
            discovered_via: 'oracle_spider'
          });
        }
      }
    }

    // 5. Linked X accounts from profile → mesh
    if (resolvedWallet && developerProfile?.twitter_handle) {
      const handle = developerProfile.twitter_handle.replace(/^@/, '');
      newLinks.push({
        source_type: 'x_account',
        source_id: handle,
        linked_type: 'wallet',
        linked_id: resolvedWallet,
        relationship: 'linked',
        confidence: 90,
        discovered_via: 'oracle_spider'
      });
    }
    
    // 6. Linked X accounts from dev_wallet_reputation
    if (resolvedWallet && devWalletRep?.twitter_url) {
      const twitterMatch = devWalletRep.twitter_url.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/i);
      if (twitterMatch) {
        const handle = twitterMatch[1].replace('@', '');
        newLinks.push({
          source_type: 'x_account',
          source_id: handle,
          linked_type: 'wallet',
          linked_id: resolvedWallet,
          relationship: 'linked',
          confidence: 85,
          discovered_via: 'oracle_spider'
        });
      }
    }

    // 7. Dev team members → mesh links
    if (resolvedWallet && devTeam?.member_wallets) {
      for (const memberWallet of devTeam.member_wallets) {
        if (memberWallet !== resolvedWallet && isBase58(memberWallet)) {
          newLinks.push({
            source_type: 'wallet',
            source_id: resolvedWallet,
            linked_type: 'wallet',
            linked_id: memberWallet,
            relationship: 'same_team',
            confidence: 80,
            discovered_via: 'oracle_spider'
          });
        }
      }
    }

    // Deduplicate links before upsert
    const linkKeys = new Set<string>();
    const dedupedLinks = newLinks.filter(link => {
      const key = `${link.source_type}:${link.source_id}:${link.linked_type}:${link.linked_id}:${link.relationship}`;
      if (linkKeys.has(key)) return false;
      linkKeys.add(key);
      return true;
    });

    // Batch upsert in chunks of 50
    if (dedupedLinks.length > 0) {
      console.log(`[Oracle] Writing ${dedupedLinks.length} mesh links...`);
      for (let i = 0; i < dedupedLinks.length; i += 50) {
        const batch = dedupedLinks.slice(i, i + 50);
        const { data: insertedLinks } = await supabase
          .from('reputation_mesh')
          .upsert(batch, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' })
          .select();
        meshLinksAdded += insertedLinks?.length || 0;
      }
      console.log(`[Oracle] Total mesh links written: ${meshLinksAdded}`);
    }

    const result: OracleResult = {
      found: hasExistingData || liveTokens.length > 0,
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
      scoreBreakdown,
      trafficLight,
      stats,
      network,
      tokenHistory,
      blacklistStatus: {
        isBlacklisted,
        reason: blacklistEntry?.blacklist_reason,
        linkedEntities: blacklistEntry?.linked_wallets || []
      },
      whitelistStatus: {
        isWhitelisted,
        reason: whitelistEntry?.whitelist_reason
      },
      recommendation,
      meshLinksAdded,
      liveAnalysis: liveAnalysis || undefined,
      upstreamChain: upstreamChain.length > 1 ? upstreamChain : undefined,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined
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
