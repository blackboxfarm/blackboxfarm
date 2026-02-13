import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
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

// Fetch tokens from pump.fun for a wallet - with FULL pagination and username lookup
async function fetchPumpfunTokens(walletAddress: string, supabase: any): Promise<any[]> {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/'
  };
  
  let allTokens: any[] = [];
  let username: string | null = null;
  
  // STEP 1: Try to get username first via profile API
  try {
    console.log('[Oracle] Fetching user profile to get username...');
    const profileUrl = `https://frontend-api.pump.fun/users/${walletAddress}`;
    const profileRes = await fetch(profileUrl, { headers });
    
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      username = profileData?.username;
      if (username) {
        console.log(`[Oracle] Found username: ${username}`);
      }
    } else {
      console.log(`[Oracle] Profile API returned ${profileRes.status}`);
    }
  } catch (e) {
    console.log('[Oracle] Profile fetch error:', e);
  }
  
  // STEP 2: Try direct API with wallet address (paginated)
  const baseEndpoints = [
    `https://frontend-api.pump.fun/coins/user-created-coins/${walletAddress}`,
    `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/user-created-coins/${walletAddress}`
  ];
  
  for (const baseUrl of baseEndpoints) {
    let offset = 0;
    const limit = 100;
    let keepFetching = true;
    
    try {
      while (keepFetching) {
        const url = `${baseUrl}?limit=${limit}&offset=${offset}&includeNsfw=true`;
        console.log(`[Oracle] Fetching tokens offset=${offset}...`);
        
        const response = await fetch(url, { headers });
        
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            allTokens = allTokens.concat(data);
            console.log(`[Oracle] Got ${data.length} tokens (total: ${allTokens.length})`);
            
            if (data.length < limit) {
              keepFetching = false; // No more pages
            } else {
              offset += limit;
              // Safety limit: max 1000 tokens
              if (offset >= 1000) keepFetching = false;
            }
          } else {
            keepFetching = false;
          }
        } else {
          console.log(`[Oracle] Pump.fun API returned ${response.status}`);
          keepFetching = false;
        }
      }
      
      if (allTokens.length > 0) {
        console.log(`[Oracle] Total tokens fetched from API: ${allTokens.length}`);
        return allTokens;
      }
    } catch (error) {
      console.error(`[Oracle] Pump.fun fetch error:`, error);
    }
  }
  
  // STEP 3: Fallback - Use Firecrawl to scrape AND find username for proper API call
  console.log('[Oracle] APIs blocked, trying Firecrawl to extract username...');
  
  try {
    // First scrape: Get user profile to find username
    const { data: firecrawlResult, error: firecrawlError } = await supabase.functions.invoke('firecrawl-scrape', {
      body: {
        url: `https://pump.fun/profile/${walletAddress}`,
        options: {
          formats: ['markdown', 'links'],
          waitFor: 5000,
          onlyMainContent: false // Get full page to find username
        }
      }
    });
    
    if (!firecrawlError && firecrawlResult?.success && firecrawlResult?.data) {
      const markdown = firecrawlResult.data.markdown || '';
      const links = firecrawlResult.data.links || [];
      
      // Extract username - look for the pattern "# username" or profile links
      // Also check for pattern like "mystayor" appearing after "View on solscan"
      const usernamePatterns = [
        /^##?\s+([a-zA-Z0-9_]+)\s*$/m,  // Heading with username
        /\[([a-zA-Z0-9_]+)\]\s*\n\s*FY/m,  // Username before wallet
        /\/profile\/([a-zA-Z0-9_]{3,30})/,  // Profile URL
      ];
      
      for (const pattern of usernamePatterns) {
        const match = markdown.match(pattern);
        if (match && match[1] && match[1] !== walletAddress.slice(0, 8)) {
          // Make sure it's not just a wallet fragment
          if (!/^[A-Za-z0-9]{32,}$/.test(match[1])) {
            username = match[1];
            console.log(`[Oracle] Extracted username: ${username}`);
            break;
          }
        }
      }
      
      // Extract "Created coins (XXX)" count
      const coinCountMatch = markdown.match(/Created coins\s*\((\d+)\)/i) ||
                            markdown.match(/(\d+)\s*Created coins/i);
      const expectedCount = coinCountMatch ? parseInt(coinCountMatch[1]) : 0;
      console.log(`[Oracle] Profile shows ${expectedCount} created coins`);
      
      // If we found username, try DexScreener API which indexes pump.fun tokens
      if (username) {
        console.log(`[Oracle] Trying DexScreener search for username: ${username}...`);
        try {
          const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${username}`, {
            headers: { 'Accept': 'application/json' }
          });
          
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            const pairs = dexData?.pairs || [];
            
            // Filter for Solana pump.fun tokens
            const pumpTokens = pairs.filter((p: any) => 
              p.chainId === 'solana' && 
              p.dexId === 'pump' || 
              p.url?.includes('pump.fun')
            );
            
            if (pumpTokens.length > 0) {
              console.log(`[Oracle] DexScreener found ${pumpTokens.length} tokens for ${username}`);
              return pumpTokens.map((p: any) => ({
                mint: p.baseToken?.address,
                name: p.baseToken?.name || 'Unknown',
                symbol: p.baseToken?.symbol || '???',
                complete: p.fdv > 1000000, // Graduated if over 1M FDV
                usd_market_cap: p.fdv || 0
              }));
            }
          }
        } catch (e) {
          console.log('[Oracle] DexScreener search failed:', e);
        }
      }
      
      // Scrape the "See all" coins page directly
      if (expectedCount > 9) {
        console.log('[Oracle] Trying to scrape full coins list page...');
        
        // Try multiple possible URLs for the full coins list
        const coinsPageUrls = [
          `https://pump.fun/profile/${walletAddress}/created`,
          `https://pump.fun/profile/${walletAddress}?tab=created`,
          username ? `https://pump.fun/profile/${username}/created` : null,
        ].filter(Boolean);
        
        for (const coinsUrl of coinsPageUrls) {
          try {
            const { data: coinsResult, error: coinsError } = await supabase.functions.invoke('firecrawl-scrape', {
              body: {
                url: coinsUrl,
                options: {
                  formats: ['links'],
                  waitFor: 8000, // Longer wait for coins to load
                  onlyMainContent: false
                }
              }
            });
            
            if (!coinsError && coinsResult?.success && coinsResult?.data?.links) {
              const coinLinks = coinsResult.data.links
                .filter((link: string) => link.includes('/coin/') || link.match(/pump\.fun\/[A-Za-z0-9]{32,44}/))
                .map((link: string) => {
                  const match = link.match(/(?:\/coin\/|pump\.fun\/)([A-Za-z0-9]{32,44})/);
                  return match ? match[1] : null;
                })
                .filter(Boolean);
              
              const uniqueMints = [...new Set(coinLinks)];
              
              if (uniqueMints.length > allTokens.length) {
                console.log(`[Oracle] Coins page found ${uniqueMints.length} unique tokens`);
                allTokens = uniqueMints.map((mint: string) => ({
                  mint,
                  name: 'Unknown',
                  symbol: '???',
                  complete: false,
                  usd_market_cap: 0
                }));
              }
            }
          } catch (e) {
            console.log(`[Oracle] Failed to scrape ${coinsUrl}:`, e);
          }
        }
      }
      
      // Extract token mints from original profile page links
      const tokenMints = links
        .filter((link: string) => link.includes('/coin/') || link.match(/pump\.fun\/[A-Za-z0-9]{32,44}/))
        .map((link: string) => {
          const match = link.match(/(?:\/coin\/|pump\.fun\/)([A-Za-z0-9]{32,44})/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
      
      const uniqueMints = [...new Set(tokenMints)] as string[];
      console.log(`[Oracle] Profile page found ${uniqueMints.length} unique token links`);
      
      // Only return early if we got a decent amount of tokens (>50% of expected)
      // Otherwise continue to Helius for better data
      const bestCount = Math.max(allTokens.length, uniqueMints.length);
      if (bestCount > 0 && (expectedCount === 0 || bestCount >= expectedCount * 0.5)) {
        if (allTokens.length > uniqueMints.length) {
          return allTokens;
        } else {
          return uniqueMints.map((mint: string) => ({
            mint,
            name: 'Unknown',
            symbol: '???',
            complete: false,
            usd_market_cap: 0
          }));
        }
      } else {
        console.log(`[Oracle] Found ${bestCount} tokens but expected ${expectedCount}, trying Helius...`);
      }
    } else {
      console.log('[Oracle] Firecrawl failed:', firecrawlError || 'no data');
    }
  } catch (error) {
    console.error('[Oracle] Firecrawl error:', error);
  }
  
  // STEP 4: Try Helius API for transaction history to find created tokens
  console.log('[Oracle] Trying Helius transaction history for created tokens...');
  try {
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (heliusKey) {
      // Use Helius parsed transaction history - find TOKEN_MINT transactions
      const txHistoryUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusKey}&type=TOKEN_MINT&limit=100`;
      
      let allMints: string[] = [];
      let currentUrl = txHistoryUrl;
      let pageCount = 0;
      
      while (currentUrl && pageCount < 10) { // Max 10 pages = 1000 tokens
        console.log(`[Oracle] Fetching Helius tx page ${pageCount + 1}...`);
        const response = await fetch(currentUrl);
        
        if (response.ok) {
          const transactions = await response.json();
          
          if (Array.isArray(transactions) && transactions.length > 0) {
            // Extract mints from TOKEN_MINT transactions
            for (const tx of transactions) {
              // Look for tokenTransfers where the wallet is the authority/signer
              const transfers = tx.tokenTransfers || [];
              for (const transfer of transfers) {
                if (transfer.mint && !allMints.includes(transfer.mint)) {
                  allMints.push(transfer.mint);
                }
              }
              
              // Also check for nativeBalanceChanges and instructions
              const instructions = tx.instructions || [];
              for (const instr of instructions) {
                // SPL Token Initialize Mint instruction has mint account
                if (instr.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                  const accounts = instr.accounts || [];
                  if (accounts.length > 0 && !allMints.includes(accounts[0])) {
                    allMints.push(accounts[0]);
                  }
                }
              }
            }
            
            // Check for pagination
            if (transactions.length < 100) {
              break; // No more pages
            }
            
            // Get last signature for pagination
            const lastTx = transactions[transactions.length - 1];
            if (lastTx?.signature) {
              currentUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusKey}&type=TOKEN_MINT&limit=100&before=${lastTx.signature}`;
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
        console.log(`[Oracle] Helius found ${allMints.length} token mints in transaction history`);
        return allMints.map((mint: string) => ({
          mint,
          name: 'Unknown',
          symbol: '???',
          complete: false,
          usd_market_cap: 0
        }));
      }
      
      // Also try DAS getAssetsByCreator
      console.log('[Oracle] Trying Helius DAS getAssetsByCreator...');
      const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
      
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
        })
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
            usd_market_cap: 0
          }));
        }
      }
    } else {
      console.log('[Oracle] No HELIUS_API_KEY configured');
    }
  } catch (error) {
    console.error('[Oracle] Helius error:', error);
  }
  
  // STEP 5: Final fallback - Check local DB cache
  console.log('[Oracle] Checking local DB for cached tokens...');
  try {
    const { data: cachedTokens } = await supabase
      .from('developer_tokens')
      .select('token_mint, token_symbol, outcome, peak_market_cap_usd, is_active')
      .eq('creator_wallet', walletAddress)
      .limit(500);
    
    if (cachedTokens && cachedTokens.length > 0) {
      console.log(`[Oracle] Found ${cachedTokens.length} cached tokens in DB`);
      return cachedTokens.map((t: any) => ({
        mint: t.token_mint,
        symbol: t.token_symbol || '???',
        name: t.token_symbol || 'Unknown',
        complete: t.outcome === 'graduated',
        usd_market_cap: t.peak_market_cap_usd || 0
      }));
    }
  } catch (error) {
    console.error('[Oracle] DB lookup error:', error);
  }
  
  console.log('[Oracle] All token fetch methods failed');
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
    
    // AUTO-SPIDER: Always fetch from pump.fun and write to DB on every lookup
    let liveTokens: any[] = [];
    let liveAnalysis: any = null;
    
    if (resolvedWallet) {
      console.log('[Oracle] Auto-spider: fetching tokens from Pump.fun...');
      liveTokens = await fetchPumpfunTokens(resolvedWallet, supabase);
      
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
        
        // Write individual tokens to developer_tokens (first 50)
        const tokenUpserts = liveTokens.slice(0, 50).map((token: any) => ({
          token_mint: token.mint,
          creator_wallet: resolvedWallet,
          developer_id: resolvedWallet, // Use wallet as developer ID
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
          meshLinksAdded: 0
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
      meshLinksAdded,
      liveAnalysis: liveAnalysis || undefined
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
