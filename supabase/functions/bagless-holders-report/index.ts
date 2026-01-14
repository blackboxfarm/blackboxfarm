import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  KNOWN_DEX_PROGRAMS,
  BONDING_CURVE_PROGRAMS,
  KNOWN_LP_WALLETS,
  BURN_ADDRESSES,
  detectLP,
  detectLaunchpad,
  type LPDetectionResult,
  type LaunchpadInfo
} from "../_shared/lp-detection.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const requestStartTime = Date.now();
  console.log('🚀 [PERF] Edge function started');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint, manualPrice } = await req.json();
    
    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Helius API key from environment (optional) - uses dedicated HELIUS_HOLDERS_KEY
    const heliusApiKey = Deno.env.get('HELIUS_HOLDERS_KEY');
    console.log(`[HELIUS] HOLDERS_KEY ${heliusApiKey ? 'FOUND' : 'NOT FOUND'}`);

    console.log(`⏱️ [PERF] Fetching all token holders for: ${tokenMint}`);

    const rpcEndpoints = heliusApiKey
      ? [`https://rpc.helius.xyz/?api-key=${heliusApiKey}`, 'https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com']
      : ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];

    let usedRpc = '';
    const rpcErrors: string[] = [];
    // Use manual price if provided, otherwise try multiple APIs
    let tokenPriceUSD = manualPrice || 0;
    let priceSource = '';
    let priceDiscoveryFailed = false;
    
    // Initialize launchpad info (will be populated later)
    let launchpadInfo: LaunchpadInfo = { name: 'unknown', detected: false, confidence: 'low' };
    
    // ============================================
    // MULTI-SOURCE LP DETECTION: Collect ALL pool addresses
    // ============================================
    const allPoolAddresses: Set<string> = new Set();
    const dexScreenerPairAddresses: Set<string> = new Set();
    let verifiedLPAccount: string | null = null;
    let verifiedLPSource: string | null = null;
    
    // ============================================
    // Source 1: Solscan Pro API - Fetch ALL markets
    // ============================================
    const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY');
    if (solscanApiKey) {
      try {
        console.log('[Solscan] Fetching ALL token markets...');
        const marketsResp = await fetch(`https://pro-api.solscan.io/v2.0/token/markets?address=${tokenMint}`, {
          headers: { 'token': solscanApiKey }
        });
        
        if (marketsResp.ok) {
          const marketsData = await marketsResp.json();
          if (marketsData.success && marketsData.data?.length > 0) {
            console.log(`[Solscan] Found ${marketsData.data.length} markets`);
            
            // Add ALL pool addresses from ALL markets
            for (const market of marketsData.data) {
              if (market.pool_address) {
                allPoolAddresses.add(market.pool_address);
                console.log(`  [Solscan] Pool: ${market.pool_address} (${market.market_name || 'Unknown DEX'})`);
              }
              if (market.market_id) {
                allPoolAddresses.add(market.market_id);
              }
              if (market.lp_address) {
                allPoolAddresses.add(market.lp_address);
              }
            }
            
            // Pick highest liquidity market for primary LP verification
            const topMarket = marketsData.data.sort((a: any, b: any) => (b.liquidity || 0) - (a.liquidity || 0))[0];
            const poolAddress = topMarket.pool_address || topMarket.market_id;
            
            if (poolAddress) {
              console.log(`[Solscan] Top market pool: ${poolAddress} (${topMarket.market_name || 'Unknown'})`);
              
              // Verify via holders endpoint
              const holdersResp = await fetch(`https://pro-api.solscan.io/v2.0/token/holders?address=${tokenMint}&page=1&page_size=50`, {
                headers: { 'token': solscanApiKey }
              });
              
              if (holdersResp.ok) {
                const holdersData = await holdersResp.json();
                if (holdersData.success && holdersData.data?.length > 0) {
                  // Find all holders matching pool addresses, AMM programs, OR Solscan-labeled LP tags
                  const allDexPrograms = [...Object.values(KNOWN_DEX_PROGRAMS), ...Object.values(BONDING_CURVE_PROGRAMS)];

                  const isSolscanLPLabeled = (holder: any): boolean => {
                    // Solscan payloads vary across endpoints/versions; do a best-effort scan
                    const hay: string[] = [];
                    const push = (v: unknown) => {
                      if (!v) return;
                      if (typeof v === 'string') hay.push(v);
                      else if (Array.isArray(v)) v.forEach(push);
                      else if (typeof v === 'object') {
                        // common nested shapes like { label: "Liquidity Pool" }
                        for (const vv of Object.values(v as Record<string, unknown>)) push(vv);
                      }
                    };

                    push(holder.label);
                    push(holder.name);
                    push(holder.type);
                    push(holder.account_type);
                    push(holder.owner_type);
                    push(holder.owner_label);
                    push(holder.owner_name);
                    push(holder.tags);
                    push(holder.labels);

                    const text = hay.join(' ').toLowerCase();
                    return (
                      text.includes('liquidity pool') ||
                      text.includes('amm pool') ||
                      text.includes('pool (lp)') ||
                      (text.includes('pool') && text.includes('lp'))
                    );
                  };

                  for (const holder of holdersData.data) {
                    const holderOwner = holder.owner || null;
                    const holderAddress = holder.address || null;
                    const candidates = [holderOwner, holderAddress].filter(Boolean) as string[];

                    const ownerProgram = holder.owner_program || holder.ownerProgram || holder.program_id || '';

                    // Check if this holder is an LP
                    const isAddressMatch = candidates.some((addr) => allPoolAddresses.has(addr));
                    const isProgramMatch = typeof ownerProgram === 'string' && allDexPrograms.includes(ownerProgram);
                    const isLabelMatch = isSolscanLPLabeled(holder);

                    if (isAddressMatch || isProgramMatch || isLabelMatch) {
                      // Add ALL candidate addresses so later RPC owner matching works reliably
                      for (const addr of candidates) allPoolAddresses.add(addr);

                      const primary = holderOwner || holderAddress;
                      if (primary) {
                        if (!verifiedLPAccount) {
                          verifiedLPAccount = primary;
                          verifiedLPSource = isLabelMatch ? 'solscan_label' : 'solscan';
                          console.log(`✅ [Solscan Verified] Primary LP: ${verifiedLPAccount} (${verifiedLPSource})`);
                        } else {
                          console.log(`  [Solscan] Additional LP: ${primary}`);
                        }
                      }
                    }
                  }
                }
              }
            }
            
            console.log(`[Solscan] Total pool addresses collected: ${allPoolAddresses.size}`);
          }
        }
      } catch (error) {
        console.error('[Solscan] API error:', error);
      }
    }
    
    // ============================================
    // Source 2: DexScreener - Fetch pair addresses
    // ============================================
    let dexScreenerPairs: any[] = [];
    let socials: { twitter?: string; telegram?: string; website?: string } = {};
    try {
      console.log('[DexScreener] Fetching token pairs...');
      const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      
      if (dexResp.ok) {
        const dexData = await dexResp.json();
        dexScreenerPairs = dexData.pairs || [];
        
        console.log(`[DexScreener] Found ${dexScreenerPairs.length} pairs`);
        
        for (const pair of dexScreenerPairs) {
          if (pair.pairAddress) {
            dexScreenerPairAddresses.add(pair.pairAddress);
            allPoolAddresses.add(pair.pairAddress);
            console.log(`  [DexScreener] Pair: ${pair.pairAddress} on ${pair.dexId}`);
          }
          // Also add the liquidity pool addresses if available
          if (pair.quoteToken?.address) {
            // Quote token is usually SOL/USDC, not the LP itself
          }
        }
        
        // Detect launchpad from first pair
        if (dexScreenerPairs.length > 0) {
          launchpadInfo = detectLaunchpad(dexScreenerPairs[0], tokenMint);
          console.log(`[DexScreener] Launchpad detected: ${launchpadInfo.name} (${launchpadInfo.confidence})`);
          
          // Extract social links from DexScreener info
          const info = dexScreenerPairs[0].info;
          if (info?.socials) {
            for (const social of info.socials) {
              if (social.type === 'twitter' && social.url) {
                socials.twitter = social.url;
              } else if (social.type === 'telegram' && social.url) {
                socials.telegram = social.url;
              }
            }
          }
          if (info?.websites?.length > 0) {
            // Filter out launchpad websites
            const nonLaunchpadSite = info.websites.find((w: any) => 
              !w.url?.includes('pump.fun') && 
              !w.url?.includes('bonk.fun') && 
              !w.url?.includes('bags.fm') &&
              !w.url?.includes('dexscreener')
            );
            if (nonLaunchpadSite?.url) {
              socials.website = nonLaunchpadSite.url;
            }
          }
          console.log(`[DexScreener] Socials found:`, socials);
        }
      }
    } catch (error) {
      console.error('[DexScreener] API error:', error);
    }
    
    console.log(`📊 [LP Detection] Total unique pool addresses: ${allPoolAddresses.size}`);
    
    // ============================================
    // PRICE DISCOVERY
    // ============================================
    if (!manualPrice || manualPrice === 0) {
      const priceStartTime = Date.now();
      console.log('⏱️ [PERF] No manual price provided, trying multiple price sources...');
      
      // Try to get price from DexScreener data we already fetched
      if (dexScreenerPairs.length > 0 && dexScreenerPairs[0].priceUsd) {
        tokenPriceUSD = parseFloat(dexScreenerPairs[0].priceUsd) || 0;
        if (tokenPriceUSD > 0) {
          priceSource = 'DexScreener (cached)';
          console.log(`✅ [PERF] Got price from cached DexScreener data: $${tokenPriceUSD}`);
        }
      }
      
      // If no price from DexScreener, try other sources
      if (tokenPriceUSD === 0) {
        const priceAPIs = [
          {
            name: 'CoinGecko',
            url: `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`,
            parser: (data: any) => data[tokenMint]?.usd || 0
          },
          {
            name: 'Jupiter v4',
            url: `https://price.jup.ag/v4/price?ids=${tokenMint}`,
            parser: (data: any) => data.data?.[tokenMint]?.price || 0
          },
          {
            name: 'Jupiter v6',
            url: `https://price.jup.ag/v6/price?ids=${tokenMint}`,
            parser: (data: any) => data.data?.[tokenMint]?.price || 0
          },
          {
            name: 'Birdeye',
            url: `https://public-api.birdeye.so/defi/price?address=${tokenMint}`,
            parser: (data: any) => data.value || 0
          }
        ];
        
        for (const api of priceAPIs) {
          const apiStartTime = Date.now();
          try {
            console.log(`⏱️ [PERF] Trying ${api.name}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(api.url, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Supabase Edge Function',
                ...(api.name === 'Birdeye' ? { 'X-API-KEY': Deno.env.get('BIRDEYE_API_KEY') || '' } : {})
              }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const data = await response.json();
              const price = api.parser(data);
              
              if (price > 0) {
                tokenPriceUSD = price;
                priceSource = api.name;
                const apiTime = Date.now() - apiStartTime;
                console.log(`✅ [PERF] Got price from ${api.name} in ${apiTime}ms: $${tokenPriceUSD}`);
                break;
              }
            }
          } catch (error) {
            const apiTime = Date.now() - apiStartTime;
            console.log(`❌ [PERF] ${api.name} failed after ${apiTime}ms:`, error instanceof Error ? error.message : String(error));
            continue;
          }
        }
      }
      
      const priceDiscoveryTime = Date.now() - priceStartTime;
      console.log(`⏱️ [PERF] Price discovery complete in ${priceDiscoveryTime}ms - Source: ${priceSource || 'FAILED'}`);
      
      if (tokenPriceUSD === 0) {
        priceDiscoveryFailed = true;
      }
    } else {
      console.log(`Using manual price: $${tokenPriceUSD}`);
      priceSource = 'Manual';
    }
    
    if (tokenPriceUSD === 0) {
      console.warn('⚠️ WARNING: All price sources failed or returned $0 - USD calculations will be incorrect');
    }
    
    // ============================================
    // RPC: Get all token accounts
    // ============================================
    const rpcStartTime = Date.now();
    console.log('⏱️ [PERF] Starting RPC account fetch...');
    let data: any = null;
    
    for (const url of rpcEndpoints) {
      try {
        const rpcCallStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const makeCall = async (programId: string, filters: any[]) => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getProgramAccounts',
              params: [
                programId,
                {
                  encoding: 'jsonParsed',
                  filters
                }
              ]
            }),
            signal: controller.signal
          });
          if (!resp.ok) {
            const msg = `RPC ${url.includes('helius') ? 'Helius' : url} failed: ${resp.status}`;
            rpcErrors.push(msg);
            return { result: [] };
          }
          const json = await resp.json();
          if (json.error) {
            const msg = `RPC ${url.includes('helius') ? 'Helius' : url} error: ${json.error.message}`;
            rpcErrors.push(msg);
            return { result: [] };
          }
          return json;
        };

        // 1) Try legacy SPL Token program (fixed data size 165)
        let json = await makeCall('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenMint } }
        ]);
        let resultCount = Array.isArray(json.result) ? json.result.length : 0;

        // 2) If empty, try Token-2022 (variable account sizes -> no dataSize filter)
        if (resultCount === 0) {
          console.log('⚠️ [PERF] No accounts via legacy SPL. Trying Token-2022...');
          json = await makeCall('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', [
            { memcmp: { offset: 0, bytes: tokenMint } }
          ]);
          resultCount = Array.isArray(json.result) ? json.result.length : 0;
        }

        clearTimeout(timeoutId);
        const rpcCallTime = Date.now() - rpcCallStart;
        const totalRpcTime = Date.now() - rpcStartTime;

        if (resultCount > 0) {
          data = json;
          usedRpc = url;
          console.log(`✅ [PERF] RPC account fetch SUCCESS via ${url.includes('helius') ? 'Helius' : 'public RPC'} in ${rpcCallTime}ms (total: ${totalRpcTime}ms) — ${resultCount} accounts`);
          break;
        } else {
          console.log(`⚠️ [PERF] RPC ${url.includes('helius') ? 'Helius' : 'public RPC'} returned 0 accounts in ${rpcCallTime}ms; will try next endpoint if available`);
          continue;
        }
      } catch (e) {
        const rpcCallTime = Date.now() - rpcStartTime;
        rpcErrors.push(`RPC ${url.includes('helius') ? 'Helius' : url} exception after ${rpcCallTime}ms: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }

    if (!data) {
      const totalRpcTime = Date.now() - rpcStartTime;
      console.log(`❌ [PERF] All RPC endpoints FAILED after ${totalRpcTime}ms`);
      throw new Error(`All RPC endpoints failed. ${rpcErrors.join(' | ')}`);
    }

    // BYPASS HISTORICAL BUYERS FETCH - Fill with ANON placeholders
    const buyersStartTime = Date.now();
    console.log('⚠️ [PERF] BYPASSING Helius/RPC Historical Buyers fetch - Using ANON placeholders');
    const firstBuyersData: any[] = [];
    const txCount = 0;
    
    for (let i = 0; i < 25; i++) {
      firstBuyersData.push({
        wallet: 'ANON',
        firstBoughtAt: Math.floor(Date.now() / 1000),
        initialTokens: 0,
        signature: '',
        purchaseRank: i + 1,
      });
    }
    
    const totalBuyersTime = Date.now() - buyersStartTime;
    console.log(`✅ [PERF] BYPASSED buyer discovery: ${totalBuyersTime.toFixed(0)}ms - Filled with ${firstBuyersData.length} ANON placeholders`);

    // ============================================
    // PROCESS HOLDERS
    // ============================================
    const holders = [];
    let totalSupply = 0;
    let potentialDevWallet: any = null;
    
    if (data.result && data.result.length > 0) {
      // Calculate total supply first
      for (const account of data.result) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          if (balance > 0) {
            totalSupply += balance;
          }
        } catch (e) {
          // Skip invalid accounts
        }
      }
      
      // Sort accounts by balance to identify earliest/largest holders
      const sortedAccounts = [...data.result].sort((a, b) => {
        const balanceA = parseFloat(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
        const balanceB = parseFloat(b.account.data.parsed.info.tokenAmount.uiAmount || 0);
        return balanceB - balanceA;
      });
      
      console.log(`\n🔍 [LP Detection] Processing ${sortedAccounts.length} holders...`);
      
      for (const account of sortedAccounts) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          const accountOwner = account.account.owner; // This is the program ID that owns the account
          
          if (balance > 0) {
            // Calculate USD value
            const usdValue = balance * tokenPriceUSD;
            
            // Calculate percentage of total supply
            const percentageOfSupply = (balance / totalSupply) * 100;
            
            // ============================================
            // ENHANCED LP DETECTION using shared function
            // ============================================
            const lpResult: LPDetectionResult = detectLP(
              owner,
              accountOwner,
              percentageOfSupply,
              allPoolAddresses,
              dexScreenerPairAddresses
            );
            
            const isLiquidityPool = lpResult.isLP;
            const lpDetectionReason = lpResult.reason || '';
            const lpConfidence = lpResult.confidence;
            const detectedPlatform = lpResult.platform || '';
            const lpSource = lpResult.source || 'heuristic';
            
            // Log LP detection for debugging (only for significant holders)
            if (percentageOfSupply > 1) {
              if (isLiquidityPool) {
                console.log(`  ✅ LP: ${owner.slice(0, 8)}... | ${percentageOfSupply.toFixed(1)}% | ${detectedPlatform} (${lpConfidence}%) | ${lpSource}`);
              } else {
                console.log(`  👤 Holder: ${owner.slice(0, 8)}... | ${percentageOfSupply.toFixed(1)}% | program: ${accountOwner.slice(0, 8)}...`);
              }
            }
            
            // Categorize wallets (excluding confirmed LPs from main categories)
            const isDustWallet = !isLiquidityPool && usdValue < 1;
            const isSmallWallet = !isLiquidityPool && usdValue >= 1 && usdValue < 12;
            const isMediumWallet = !isLiquidityPool && usdValue >= 12 && usdValue < 25;
            const isLargeWallet = !isLiquidityPool && usdValue >= 25 && usdValue < 49;
            const isBossWallet = !isLiquidityPool && usdValue >= 200 && usdValue < 500;
            const isKingpinWallet = !isLiquidityPool && usdValue >= 500 && usdValue < 1000;
            const isSuperBossWallet = !isLiquidityPool && usdValue >= 1000 && usdValue < 2000;
            const isBabyWhaleWallet = !isLiquidityPool && usdValue >= 2000 && usdValue < 5000;
            const isTrueWhaleWallet = !isLiquidityPool && usdValue >= 5000;
            
            const holderData = {
              owner,
              balance,
              usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              percentageOfSupply,
              isLiquidityPool,
              lpDetectionReason,
              lpConfidence,
              detectedPlatform,
              lpSource,
              isDustWallet,
              isSmallWallet,
              isMediumWallet,
              isLargeWallet,
              isBossWallet,
              isKingpinWallet,
              isSuperBossWallet,
              isBabyWhaleWallet,
              isTrueWhaleWallet,
              tokenAccount: account.pubkey,
              accountOwnerProgram: accountOwner
            };
            
            holders.push(holderData);
          }
        } catch (e) {
          console.error(`Error processing account ${account.pubkey}:`, e);
        }
      }
    }

    // Sort by balance descending
    holders.sort((a, b) => b.balance - a.balance);

    // Add rank
    const rankedHolders = holders.map((holder, index) => ({
      ...holder,
      rank: index + 1
    }));

    // Separate LP and non-LP wallets
    const lpWallets = rankedHolders.filter(h => h.isLiquidityPool);
    const nonLpHolders = rankedHolders.filter(h => !h.isLiquidityPool);
    
    console.log(`\n📊 [LP Summary] Detected ${lpWallets.length} LP wallet(s):`);
    for (const lp of lpWallets) {
      console.log(`  - ${lp.owner.slice(0, 12)}... | ${lp.percentageOfSupply.toFixed(1)}% | ${lp.detectedPlatform} (${lp.lpSource})`);
    }
    
    // IMPROVED DEV WALLET DETECTION using historical first buyers
    if (firstBuyersData.length > 0) {
      for (let i = 0; i < Math.min(10, firstBuyersData.length); i++) {
        const earlyBuyer = firstBuyersData[i];
        const currentHolder = rankedHolders.find(h => h.owner === earlyBuyer.wallet);
        
        if (currentHolder && !currentHolder.isLiquidityPool) {
          const initialPercentage = (earlyBuyer.initialTokens / totalSupply) * 100;
          
          if (initialPercentage >= 5 && initialPercentage <= 20) {
            potentialDevWallet = {
              address: currentHolder.owner,
              balance: currentHolder.balance,
              usdValue: currentHolder.usdValue,
              percentageOfSupply: currentHolder.percentageOfSupply,
              initialPercentage,
              purchaseRank: earlyBuyer.purchaseRank,
              firstBoughtAt: earlyBuyer.firstBoughtAt,
              confidence: 90 - (i * 5),
              detectionMethod: 'early_large_holder',
              reason: `Early buyer #${earlyBuyer.purchaseRank} with ${initialPercentage.toFixed(1)}% initial allocation`
            };
            console.log(`🔍 Dev Wallet Detected: ${potentialDevWallet.address} (buyer #${earlyBuyer.purchaseRank}, ${initialPercentage.toFixed(1)}% initial)`);
            break;
          }
        }
      }
    }
    
    // Fallback to top holder if no dev detected from history
    if (!potentialDevWallet && nonLpHolders.length > 0) {
      const topNonLpHolder = nonLpHolders[0];
      potentialDevWallet = {
        address: topNonLpHolder.owner,
        balance: topNonLpHolder.balance,
        usdValue: topNonLpHolder.usdValue,
        percentageOfSupply: topNonLpHolder.percentageOfSupply,
        confidence: topNonLpHolder.percentageOfSupply > 10 ? 65 : 45,
        detectionMethod: 'top_holder',
        reason: topNonLpHolder.percentageOfSupply > 10 
          ? `Top holder with ${topNonLpHolder.percentageOfSupply.toFixed(1)}% of supply`
          : 'Top non-LP holder (potential dev)'
      };
      console.log(`🔍 Potential Dev Wallet (fallback): ${potentialDevWallet.address} (${potentialDevWallet.percentageOfSupply.toFixed(1)}%)`);
    }
    
    // CALCULATE SELL TRACKING AND PNL FOR FIRST 25 BUYERS
    const firstBuyersWithPNL: any[] = [];
    
    for (const buyer of firstBuyersData) {
      const currentHolder = rankedHolders.find(h => h.owner === buyer.wallet);
      const currentBalance = currentHolder?.balance || 0;
      const tokensSold = Math.max(0, buyer.initialTokens - currentBalance);
      const percentageSold = buyer.initialTokens > 0 ? (tokensSold / buyer.initialTokens) * 100 : 0;
      
      const initialValueEstimate = buyer.initialTokens * (tokenPriceUSD * 0.1);
      const currentValue = currentBalance * tokenPriceUSD;
      const soldValue = tokensSold * tokenPriceUSD;
      const totalValue = currentValue + soldValue;
      const pnl = totalValue - initialValueEstimate;
      const pnlPercentage = initialValueEstimate > 0 ? (pnl / initialValueEstimate) * 100 : 0;
      
      firstBuyersWithPNL.push({
        ...buyer,
        currentBalance,
        currentUsdValue: currentValue,
        currentPercentageOfSupply: currentHolder?.percentageOfSupply || 0,
        tokensSold,
        percentageSold,
        hasSold: tokensSold > 0,
        pnl,
        pnlPercentage,
        isLiquidityPool: currentHolder?.isLiquidityPool || false,
        isDevWallet: buyer.wallet === potentialDevWallet?.address
      });
    }
    
    console.log(`📊 First 25 buyers PNL calculated: ${firstBuyersWithPNL.filter(b => b.hasSold).length} have sold`);
    
    const dustWallets = rankedHolders.filter(h => h.isDustWallet).length;
    const smallWallets = rankedHolders.filter(h => h.isSmallWallet).length;
    const mediumWallets = rankedHolders.filter(h => h.isMediumWallet).length;
    const largeWallets = rankedHolders.filter(h => h.isLargeWallet).length;
    const bossWallets = rankedHolders.filter(h => h.isBossWallet).length;
    const kingpinWallets = rankedHolders.filter(h => h.isKingpinWallet).length;
    const superBossWallets = rankedHolders.filter(h => h.isSuperBossWallet).length;
    const babyWhaleWallets = rankedHolders.filter(h => h.isBabyWhaleWallet).length;
    const trueWhaleWallets = rankedHolders.filter(h => h.isTrueWhaleWallet).length;
    const realWallets = rankedHolders.filter(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet && !h.isBossWallet && !h.isKingpinWallet && !h.isSuperBossWallet && !h.isBabyWhaleWallet && !h.isTrueWhaleWallet && !h.isLiquidityPool).length;
    const totalBalance = rankedHolders.reduce((sum, h) => sum + h.balance, 0);
    const lpBalance = lpWallets.reduce((sum, h) => sum + h.balance, 0);
    const nonLpBalance = nonLpHolders.reduce((sum, h) => sum + h.balance, 0);

    const totalTime = Date.now() - requestStartTime;
    console.log(`\n✅ [PERF] Request complete in ${totalTime}ms`);
    console.log(`Found ${rankedHolders.length} token holders`);
    console.log(`LP wallets detected: ${lpWallets.length} (${(lpBalance/totalBalance*100).toFixed(1)}% of supply)`);
    console.log(`Real wallets: ${realWallets}, Boss wallets: ${bossWallets}, Kingpin wallets: ${kingpinWallets}, Super Boss wallets: ${superBossWallets}, Baby Whale wallets: ${babyWhaleWallets}, True Whale wallets: ${trueWhaleWallets}, Large wallets: ${largeWallets}, Medium wallets: ${mediumWallets}, Small wallets: ${smallWallets}, Dust wallets: ${dustWallets}`);

    const result = {
      tokenMint,
      totalHolders: rankedHolders.length,
      liquidityPoolsDetected: lpWallets.length,
      lpBalance,
      lpPercentageOfSupply: lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0,
      nonLpHolders: nonLpHolders.length,
      nonLpBalance,
      realWallets,
      bossWallets,
      kingpinWallets,
      superBossWallets,
      babyWhaleWallets,
      launchpadInfo,
      trueWhaleWallets,
      largeWallets,
      mediumWallets,
      smallWallets,
      dustWallets,
      totalBalance,
      tokenPriceUSD,
      priceSource,
      rpcSource: usedRpc,
      priceDiscoveryFailed,
      holders: rankedHolders,
      liquidityPools: lpWallets,
      potentialDevWallet,
      socials: Object.keys(socials).length > 0 ? socials : undefined,
      firstBuyers: firstBuyersWithPNL,
      firstBuyersError: firstBuyersData.length === 0 ? 
        (heliusApiKey ? 
          `No buyers found (searched ${txCount} transactions using Enhanced Transactions API)` : 
          'Helius API key not configured - historical buyer tracking unavailable') : 
        null,
      firstBuyersDebug: {
        endpoint: heliusApiKey ? 'POST /v0/transactions + RPC fallback' : 'RPC fallback',
        method: heliusApiKey ? 'mint_search' : 'rpc getSignaturesForAddress + getTransaction',
        buyersFound: firstBuyersData.length,
        totalTransactionsSearched: txCount
      },
      lpDetectionDebug: {
        solscanPoolsFound: allPoolAddresses.size,
        dexScreenerPairsFound: dexScreenerPairAddresses.size,
        verifiedLPAccount,
        verifiedLPSource,
        knownDexProgramsCount: Object.keys(KNOWN_DEX_PROGRAMS).length,
        knownLPWalletsCount: KNOWN_LP_WALLETS.size
      },
      summary: `Found ${rankedHolders.length} total holders (${lpWallets.length} LP detected${lpWallets.length > 0 ? ': ' + lpWallets.map(lp => lp.detectedPlatform).filter(Boolean).join(', ') : ''}). ${trueWhaleWallets} true whale wallets (≥$5K), ${babyWhaleWallets} baby whale wallets ($2K-$5K), ${superBossWallets} super boss wallets ($1K-$2K), ${kingpinWallets} kingpin wallets ($500-$1K), ${bossWallets} boss wallets ($200-$500), ${realWallets} real wallets ($50-$199), ${largeWallets} large wallets ($5-$49), ${mediumWallets} medium wallets ($1-$4), ${smallWallets} small wallets (<$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}${priceSource ? ` (Price from ${priceSource})` : ''}${potentialDevWallet ? `. Potential dev: ${potentialDevWallet.address.slice(0, 4)}...${potentialDevWallet.address.slice(-4)} (${potentialDevWallet.percentageOfSupply.toFixed(1)}%)` : ''}. First ${firstBuyersWithPNL.length} buyers tracked with ${firstBuyersWithPNL.filter(b => b.hasSold).length} having sold tokens.`
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Holders report error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Holders report failed', 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
