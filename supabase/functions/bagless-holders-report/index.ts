import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { detectLP, type LPDetectionResult, type LaunchpadInfo } from "../_shared/lp-detection.ts"
import { fetchDexScreenerData } from "../_shared/dexscreener-api.ts"
import { fetchCreatorInfo } from "../_shared/creator-api.ts"
import { fetchSolscanMarkets } from "../_shared/solscan-markets.ts"
import { fetchRugCheckInsiders, type InsidersGraphResult } from "../_shared/rugcheck-insiders.ts"
import { 
  startSearchLog, 
  extractIpAddress, 
  logCompleteSearch 
} from "../_shared/token-search-logger.ts"
import {
  crossLinkHolderReputation,
  fetchHistoricalDelta,
  feedTokenLifecycle,
  detectSocialChanges,
} from "../_shared/holder-intelligence.ts"

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

  // Extract tracking info from request
  const ipAddress = extractIpAddress(req);
  const userAgent = req.headers.get('user-agent') || undefined;
  
  let searchId: string | null = null;

  try {
    const { tokenMint, manualPrice, sessionId, visitorFingerprint } = await req.json();
    
    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start search log (fire and forget - don't block)
    searchId = await startSearchLog({
      tokenMint,
      sessionId,
      visitorFingerprint,
      ipAddress,
      userAgent,
    });

    const { getHeliusApiKey, getHeliusRpcUrl } = await import('../_shared/helius-client.ts');
    const heliusApiKey = getHeliusApiKey();
    console.log(`[HELIUS] API_KEY ${heliusApiKey ? 'FOUND' : 'NOT FOUND'}`);

    console.log(`⏱️ [PERF] Fetching all token holders for: ${tokenMint}`);

    const rpcEndpoints = [
      ...(heliusApiKey ? [getHeliusRpcUrl(heliusApiKey)] : []),
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
    ];

    let usedRpc = '';
    const rpcErrors: string[] = [];
    let tokenPriceUSD = manualPrice || 0;
    let priceSource = '';
    let priceDiscoveryFailed = false;
    let launchpadInfo: LaunchpadInfo = { name: 'unknown', detected: false, confidence: 'low' };
    
    const allPoolAddresses: Set<string> = new Set();
    const dexScreenerPairAddresses: Set<string> = new Set();
    
    // ============================================
    // PARALLEL API FETCHES
    // ============================================
    const [solscanResult, dexResult, insidersResult] = await Promise.all([
      fetchSolscanMarkets(tokenMint),
      fetchDexScreenerData(tokenMint),
      fetchRugCheckInsiders(tokenMint)
    ]);
    
    // Merge pool addresses from Solscan
    for (const addr of solscanResult.poolAddresses) {
      allPoolAddresses.add(addr);
    }
    
    // Merge pool addresses from DexScreener
    for (const addr of dexResult.pairAddresses) {
      allPoolAddresses.add(addr);
      dexScreenerPairAddresses.add(addr);
    }
    
    launchpadInfo = dexResult.launchpadInfo;
    const socials = dexResult.socials;
    const dexStatus = dexResult.dexStatus;

    // Best-effort token metadata from DexScreener (used by UI + share template)
    const dexPair0: any = Array.isArray(dexResult.pairs) ? dexResult.pairs[0] : null;
    const tokenSymbol: string = (dexPair0?.baseToken?.symbol || dexPair0?.baseToken?.name || '').toString();
    const tokenName: string = (dexPair0?.baseToken?.name || dexPair0?.baseToken?.symbol || '').toString();
    const dexMarketCapRaw = dexPair0?.marketCap ?? dexPair0?.fdv;
    const dexMarketCapUSD = typeof dexMarketCapRaw === 'number'
      ? dexMarketCapRaw
      : (dexMarketCapRaw ? Number(dexMarketCapRaw) : 0);
    
    // Use DexScreener price if available
    if (!manualPrice && dexResult.priceUsd > 0) {
      tokenPriceUSD = dexResult.priceUsd;
      priceSource = 'DexScreener';
      console.log(`✅ Got price from DexScreener: $${tokenPriceUSD}`);
    }
    
    // Fetch creator info
    const creatorInfo = await fetchCreatorInfo(launchpadInfo, tokenMint);
    
    console.log(`📊 [LP Detection] Total unique pool addresses: ${allPoolAddresses.size}`);
    
    // ============================================
    // PRICE DISCOVERY (if still needed)
    // ============================================
    if (tokenPriceUSD === 0) {
      const priceAPIs = [
        { name: 'Jupiter', url: `https://price.jup.ag/v4/price?ids=${tokenMint}`, parser: (d: any) => d.data?.[tokenMint]?.price || 0 },
        { name: 'CoinGecko', url: `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`, parser: (d: any) => d[tokenMint]?.usd || 0 }
      ];
      
      for (const api of priceAPIs) {
        try {
          const resp = await fetch(api.url, { signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            const data = await resp.json();
            const price = api.parser(data);
            if (price > 0) {
              tokenPriceUSD = price;
              priceSource = api.name;
              console.log(`✅ Got price from ${api.name}: $${tokenPriceUSD}`);
              break;
            }
          }
        } catch (e) {
          console.log(`${api.name} failed`);
        }
      }
      
      if (tokenPriceUSD === 0) {
        priceDiscoveryFailed = true;
      }
    }
    
    if (manualPrice) {
      priceSource = 'Manual';
    }
    
    // ============================================
    // RPC: Get all token accounts
    // ============================================
    let data: any = null;
    
    for (const url of rpcEndpoints) {
      try {
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
              params: [programId, { encoding: 'jsonParsed', filters }]
            }),
            signal: controller.signal
          });
          if (!resp.ok) return { result: [] };
          const json = await resp.json();
          if (json.error) return { result: [] };
          return json;
        };

        let json = await makeCall('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenMint } }
        ]);
        let resultCount = Array.isArray(json.result) ? json.result.length : 0;

        if (resultCount === 0) {
          json = await makeCall('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', [
            { memcmp: { offset: 0, bytes: tokenMint } }
          ]);
          resultCount = Array.isArray(json.result) ? json.result.length : 0;
        }

        clearTimeout(timeoutId);

        if (resultCount > 0) {
          data = json;
          usedRpc = url;
          console.log(`✅ RPC SUCCESS — ${resultCount} accounts`);
          break;
        }
      } catch (e) {
        rpcErrors.push(String(e));
        continue;
      }
    }

    if (!data) {
      throw new Error(`All RPC endpoints failed. ${rpcErrors.join(' | ')}`);
    }

    // ============================================
    // PROCESS HOLDERS
    // ============================================
    const holders = [];
    let totalSupply = 0;
    let potentialDevWallet: any = null;
    
    if (data.result && data.result.length > 0) {
      for (const account of data.result) {
        try {
          const balance = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount || 0);
          if (balance > 0) totalSupply += balance;
        } catch (e) {}
      }
      
      const sortedAccounts = [...data.result].sort((a, b) => {
        const balA = parseFloat(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
        const balB = parseFloat(b.account.data.parsed.info.tokenAmount.uiAmount || 0);
        return balB - balA;
      });
      
      for (const account of sortedAccounts) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          const accountOwner = account.account.owner;
          
          if (balance > 0) {
            const usdValue = balance * tokenPriceUSD;
            const percentageOfSupply = (balance / totalSupply) * 100;
            
            const lpResult: LPDetectionResult = detectLP(
              owner, accountOwner, percentageOfSupply,
              allPoolAddresses, dexScreenerPairAddresses
            );
            
            const isLiquidityPool = lpResult.isLP;
            const isDustWallet = !isLiquidityPool && usdValue < 1;
            const isSmallWallet = !isLiquidityPool && usdValue >= 1 && usdValue < 12;
            const isMediumWallet = !isLiquidityPool && usdValue >= 12 && usdValue < 25;
            const isLargeWallet = !isLiquidityPool && usdValue >= 25 && usdValue < 50;
            const isRealWallet = !isLiquidityPool && usdValue >= 50 && usdValue < 200;  // NEW: $50-$199 tier
            const isBossWallet = !isLiquidityPool && usdValue >= 200 && usdValue < 500;
            const isKingpinWallet = !isLiquidityPool && usdValue >= 500 && usdValue < 1000;
            const isSuperBossWallet = !isLiquidityPool && usdValue >= 1000 && usdValue < 2000;
            const isBabyWhaleWallet = !isLiquidityPool && usdValue >= 2000 && usdValue < 5000;
            const isTrueWhaleWallet = !isLiquidityPool && usdValue >= 5000;
            
            holders.push({
              owner, balance, usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              percentageOfSupply,
              isLiquidityPool,
              lpDetectionReason: lpResult.reason || '',
              lpConfidence: lpResult.confidence,
              detectedPlatform: lpResult.platform || '',
              lpSource: lpResult.source || 'heuristic',
              isDustWallet, isSmallWallet, isMediumWallet, isLargeWallet, isRealWallet,
              isBossWallet, isKingpinWallet, isSuperBossWallet, isBabyWhaleWallet, isTrueWhaleWallet,
              tokenAccount: account.pubkey,
              accountOwnerProgram: accountOwner
            });
          }
        } catch (e) {}
      }
    }

    holders.sort((a, b) => b.balance - a.balance);

    const rankedHolders = holders.map((holder, index) => ({ ...holder, rank: index + 1 }));

    const lpWallets = rankedHolders.filter(h => h.isLiquidityPool);
    const nonLpHolders = rankedHolders.filter(h => !h.isLiquidityPool);
    
    // Dev wallet detection — prefer verified creator wallet from launchpad API
    if (creatorInfo.wallet) {
      const creatorHolder = nonLpHolders.find(h => h.owner === creatorInfo.wallet);
      if (creatorHolder) {
        potentialDevWallet = {
          address: creatorHolder.owner,
          balance: creatorHolder.balance,
          usdValue: creatorHolder.usdValue,
          percentageOfSupply: creatorHolder.percentageOfSupply,
          confidence: 100,
          detectionMethod: 'creator_api',
          reason: `Verified creator wallet via ${launchpadInfo.name} (${creatorHolder.percentageOfSupply.toFixed(1)}%)`
        };
      } else {
        // Creator wallet exists but holds 0 — still mark it
        potentialDevWallet = {
          address: creatorInfo.wallet,
          balance: 0,
          usdValue: 0,
          percentageOfSupply: 0,
          confidence: 95,
          detectionMethod: 'creator_api_sold',
          reason: `Verified creator via ${launchpadInfo.name} — sold entire position`
        };
      }
    } else if (nonLpHolders.length > 0) {
      // Fallback: heuristic — top non-LP holder
      const top = nonLpHolders[0];
      potentialDevWallet = {
        address: top.owner,
        balance: top.balance,
        usdValue: top.usdValue,
        percentageOfSupply: top.percentageOfSupply,
        confidence: top.percentageOfSupply > 10 ? 65 : 45,
        detectionMethod: 'top_holder',
        reason: `Top non-LP holder (${top.percentageOfSupply.toFixed(1)}%) — creator unverified`
      };
    }
    
    // === GRANULAR WALLET CATEGORIES (existing) ===
    const dustWallets = rankedHolders.filter(h => h.isDustWallet).length;
    const smallWallets = rankedHolders.filter(h => h.isSmallWallet).length;
    const mediumWallets = rankedHolders.filter(h => h.isMediumWallet).length;
    const largeWallets = rankedHolders.filter(h => h.isLargeWallet).length;
    const realWalletCount = rankedHolders.filter(h => h.isRealWallet).length;  // NEW: $50-$199 tier
    const bossWallets = rankedHolders.filter(h => h.isBossWallet).length;
    const kingpinWallets = rankedHolders.filter(h => h.isKingpinWallet).length;
    const superBossWallets = rankedHolders.filter(h => h.isSuperBossWallet).length;
    const babyWhaleWallets = rankedHolders.filter(h => h.isBabyWhaleWallet).length;
    const trueWhaleWallets = rankedHolders.filter(h => h.isTrueWhaleWallet).length;
    
    // === SIMPLE WALLET TIERS (new) ===
    // Dust: < $1, Retail: $1-199, Serious: $200-1000, Whales: > $1000
    const simpleTiers = {
      dust: { count: 0, percentage: 0, avgValue: 0, totalValue: 0 },
      retail: { count: 0, percentage: 0, avgValue: 0, totalValue: 0 },
      serious: { count: 0, percentage: 0, avgValue: 0, totalValue: 0 },
      whales: { count: 0, percentage: 0, avgValue: 0, totalValue: 0 }
    };
    
    for (const h of nonLpHolders) {
      if (h.usdValue < 1) {
        simpleTiers.dust.count++;
        simpleTiers.dust.totalValue += h.usdValue;
        simpleTiers.dust.percentage += h.percentageOfSupply;
      } else if (h.usdValue < 200) {
        simpleTiers.retail.count++;
        simpleTiers.retail.totalValue += h.usdValue;
        simpleTiers.retail.percentage += h.percentageOfSupply;
      } else if (h.usdValue <= 1000) {
        simpleTiers.serious.count++;
        simpleTiers.serious.totalValue += h.usdValue;
        simpleTiers.serious.percentage += h.percentageOfSupply;
      } else {
        simpleTiers.whales.count++;
        simpleTiers.whales.totalValue += h.usdValue;
        simpleTiers.whales.percentage += h.percentageOfSupply;
      }
    }
    
    // Calculate averages
    for (const tier of Object.values(simpleTiers)) {
      tier.avgValue = tier.count > 0 ? tier.totalValue / tier.count : 0;
    }
    
    // === TOP HOLDER CONCENTRATION (excluding LP) ===
    const top5 = nonLpHolders.slice(0, 5);
    const top10 = nonLpHolders.slice(0, 10);
    const top20 = nonLpHolders.slice(0, 20);
    
    const distributionStats = {
      top5Percentage: top5.reduce((sum, h) => sum + h.percentageOfSupply, 0),
      top10Percentage: top10.reduce((sum, h) => sum + h.percentageOfSupply, 0),
      top20Percentage: top20.reduce((sum, h) => sum + h.percentageOfSupply, 0),
      top5Wallets: top5.length,
      top10Wallets: top10.length,
      top20Wallets: top20.length
    };
    
    // === CIRCULATING SUPPLY (excluding LP) ===
    const totalBalance = rankedHolders.reduce((sum, h) => sum + h.balance, 0);
    const lpBalance = lpWallets.reduce((sum, h) => sum + h.balance, 0);
    const nonLpBalance = nonLpHolders.reduce((sum, h) => sum + h.balance, 0);
    const circulatingSupplyExcludingLP = nonLpBalance;
    const circulatingPercentage = totalBalance > 0 ? (nonLpBalance / totalBalance) * 100 : 0;

    const inferredMarketCapUSD = (
      !Number.isNaN(dexMarketCapUSD) && dexMarketCapUSD > 0
    )
      ? dexMarketCapUSD
      : (totalBalance > 0 && tokenPriceUSD > 0 ? totalBalance * tokenPriceUSD : 0);
    
    // === RISK FLAGS ===
    const riskFlags: string[] = [];
    
    // Flag: Top wallets control high percentage
    if (distributionStats.top5Percentage > 25) {
      riskFlags.push(`${top5.length} wallets control ${distributionStats.top5Percentage.toFixed(1)}% (excluding LP)`);
    }
    
    // Flag: LP too low
    const lpPercentage = totalBalance > 0 ? (lpBalance / totalBalance * 100) : 0;
    if (lpPercentage < 15 && lpWallets.length > 0) {
      riskFlags.push(`LP < 15% of circulating (${lpPercentage.toFixed(1)}%)`);
    }
    
    // Flag: Very few whales
    if (simpleTiers.whales.count === 0 && rankedHolders.length > 50) {
      riskFlags.push('No whale holders detected (>$1K)');
    }
    
    // Flag: High dust percentage
    if (simpleTiers.dust.percentage > 30) {
      riskFlags.push(`High dust: ${simpleTiers.dust.percentage.toFixed(1)}% in wallets under $1`);
    }
    
    // Flag: Insider concentration from RugCheck
    if (insidersResult.hasInsiders && insidersResult.bundledPercentage > 10) {
      riskFlags.push(`Bundled wallets: ${insidersResult.bundledPercentage.toFixed(1)}% supply`);
    }
    
    // === LIFECYCLE-AWARE HEALTH SCORE ===
    const vitality = dexResult.vitality;
    const pairAgeMs = vitality.pairCreatedAt ? (Date.now() - vitality.pairCreatedAt) : null;
    const pairAgeHours = pairAgeMs ? pairAgeMs / 3600000 : null;
    
    // 8-phase detection (inline to avoid import issues with shared module in edge fn)
    type HealthPhase = 'on_curve' | 'newborn' | 'early' | 'adolescent' | 'established' | 'growth' | 'mature' | 'blue_chip';
    let healthPhase: HealthPhase = 'on_curve';
    
    // Graduated DEX venues — PumpSwap, Raydium, Orca, Meteora all mean token left bonding curve
    const dexId = vitality.dexId || (dexResult.pairs?.[0]?.dexId) || null;
    const graduatedDex = dexId?.toLowerCase();
    const isGraduatedVenue = graduatedDex === 'pumpswap' || graduatedDex === 'raydium' || graduatedDex === 'orca' || graduatedDex === 'meteora';
    
    if (vitality.pairCreatedAt && (vitality.liquidityUsd > 50000 || isGraduatedVenue)) {
      if (pairAgeHours! < 2) healthPhase = 'newborn';
      else if (pairAgeHours! < 12) healthPhase = 'early';
      else if (pairAgeHours! < 48) healthPhase = 'adolescent';
      else if (pairAgeHours! < 168) healthPhase = 'established'; // 7 days
      else if (pairAgeHours! < 720) healthPhase = 'growth'; // 30 days
      else if (pairAgeHours! < 2160) healthPhase = 'mature'; // 90 days
      else {
        healthPhase = vitality.volume.h24 > 1_000_000 ? 'blue_chip' : 'mature';
      }
    }
    
    // Helper: score a metric 0-100
    const scoreMetric = (value: number, good: number, bad: number): number => {
      if (good === bad) return 50;
      const raw = ((value - bad) / (good - bad)) * 100;
      return Math.max(0, Math.min(100, raw));
    };
    
    // Compute individual metric scores
    const holderCountScore = scoreMetric(nonLpHolders.length, 500, 20);
    const whaleScore = scoreMetric(distributionStats.top5Percentage, 10, 50); // lower is better
    const lpScore = scoreMetric(lpPercentage, 30, 5);
    const bundledScore = scoreMetric(insidersResult.bundledPercentage, 0, 25); // lower is better
    const dustScore = scoreMetric(simpleTiers.dust.percentage, 10, 60); // lower is better
    
    // Buy/sell ratio
    const isEarlyPhase = healthPhase === 'on_curve' || healthPhase === 'newborn' || healthPhase === 'early';
    const txWindow = isEarlyPhase ? vitality.txns.h1 : vitality.txns.h24;
    const totalTxns = txWindow.buys + txWindow.sells;
    const buySellRatio = totalTxns > 0 ? txWindow.buys / totalTxns : 0.5;
    const buySellScore = scoreMetric(buySellRatio, 0.7, 0.2);
    
    // Volume trend score
    const vol24 = vitality.volume.h24;
    const volToMcap = inferredMarketCapUSD > 0 ? (vol24 / inferredMarketCapUSD) : 0;
    const volumeScore = scoreMetric(volToMcap, 0.5, 0.01);
    
    // Price trend score
    const priceH24 = vitality.priceChange.h24;
    const priceTrendScore = scoreMetric(priceH24, 20, -50);
    
    // Dev holding score
    const devPct = potentialDevWallet?.percentageOfSupply ?? 0;
    const devThresholdGood = isEarlyPhase ? 15 : healthPhase === 'adolescent' ? 10 : 5;
    const devScore = scoreMetric(devPct, devThresholdGood, 40);
    
    // 8-phase weighted scoring matrix (dust is now weighted in ALL phases)
    const weights: Record<HealthPhase, Record<string, number>> = {
      on_curve:    { holders: 0.25, whales: 0.10, dev: 0.20, buySell: 0.15, bundled: 0.05, lp: 0,    volume: 0,    price: 0.05, dust: 0.20 },
      newborn:     { holders: 0.15, whales: 0.15, dev: 0.15, buySell: 0.15, bundled: 0.10, lp: 0.05, volume: 0.05, price: 0.05, dust: 0.10 },
      early:       { holders: 0.12, whales: 0.20, dev: 0.12, buySell: 0.15, bundled: 0.10, lp: 0.10, volume: 0.06, price: 0.05, dust: 0.10 },
      adolescent:  { holders: 0.12, whales: 0.20, dev: 0.12, buySell: 0.12, bundled: 0.10, lp: 0.13, volume: 0.06, price: 0.05, dust: 0.10 },
      established: { holders: 0.08, whales: 0.20, dev: 0.10, buySell: 0.10, bundled: 0.12, lp: 0.12, volume: 0.10, price: 0.08, dust: 0.10 },
      growth:      { holders: 0.08, whales: 0.18, dev: 0.08, buySell: 0.10, bundled: 0.12, lp: 0.12, volume: 0.12, price: 0.10, dust: 0.10 },
      mature:      { holders: 0.08, whales: 0.18, dev: 0.05, buySell: 0.10, bundled: 0.12, lp: 0.12, volume: 0.10, price: 0.15, dust: 0.10 },
      blue_chip:   { holders: 0.05, whales: 0.15, dev: 0.05, buySell: 0.10, bundled: 0.10, lp: 0.10, volume: 0.15, price: 0.15, dust: 0.15 },
    };
    
    const w = weights[healthPhase];
    const healthBreakdown: Record<string, { score: number; weight: number; contribution: number }> = {};
    const metrics: Record<string, number> = {
      holders: holderCountScore, whales: whaleScore, dev: devScore, buySell: buySellScore,
      bundled: bundledScore, lp: lpScore, volume: volumeScore, price: priceTrendScore, dust: dustScore,
    };
    
    let healthScore = 0;
    for (const [key, weight] of Object.entries(w)) {
      const s = metrics[key] ?? 50;
      const contribution = s * weight;
      healthScore += contribution;
      if (weight > 0) healthBreakdown[key] = { score: Math.round(s), weight, contribution: Math.round(contribution) };
    }
    
    // === VITALITY PENALTIES (post-bond only) ===
    const vitalityPenalties: string[] = [];
    if (healthPhase !== 'on_curve') {
      if (vol24 < 500 && nonLpHolders.length > 100) { healthScore -= 15; vitalityPenalties.push('Volume collapse (<$500/24h)'); }
      if (vitality.txns.h1.buys + vitality.txns.h1.sells === 0) { healthScore -= 10; vitalityPenalties.push('Zero transactions in last hour'); }
    }
    
    // Dead/sleeper on curve
    if (healthPhase === 'on_curve' && pairAgeHours === null) {
      const totalTxns1h = vitality.txns.h1.buys + vitality.txns.h1.sells;
      if (vol24 < 100 && totalTxns1h === 0) {
        healthScore -= 25;
        vitalityPenalties.push('Dead on curve: zero activity, never bonded');
      } else if (vol24 < 1000 && totalTxns1h < 5) {
        healthScore -= 10;
        vitalityPenalties.push('Sleeper on curve: minimal activity, not bonded');
      }
    } else if (healthPhase === 'on_curve' && pairAgeHours !== null && pairAgeHours >= 24) {
      const totalTxns1h = vitality.txns.h1.buys + vitality.txns.h1.sells;
      if (vol24 < 100 && totalTxns1h === 0) {
        healthScore -= 30;
        vitalityPenalties.push(`Dead on curve: ${Math.floor(pairAgeHours)}h old, zero activity`);
      } else if (vol24 < 1000 && totalTxns1h < 5) {
        healthScore -= 15;
        vitalityPenalties.push(`Sleeper on curve: ${Math.floor(pairAgeHours)}h old, tiny activity`);
      }
    }
    
    // === CRASH-TRAJECTORY DETECTION ===
    const priceH1 = vitality.priceChange.m5 !== undefined ? vitality.priceChange.h1 : 0;
    const priceH6 = vitality.priceChange.h6 || 0;
    
    // Bleed arc: sustained downtrend across timeframes
    if (priceH1 < -30 && priceH6 < -60) {
      healthScore -= 20;
      vitalityPenalties.push(`Bleed arc: -${Math.abs(Math.round(priceH1))}% 1h, -${Math.abs(Math.round(priceH6))}% 6h`);
    }
    
    // Dump in progress: massive crash + sell-heavy order flow
    if (priceH24 < -80 && vitality.txns.h1.sells > vitality.txns.h1.buys * 3) {
      healthScore -= 25;
      vitalityPenalties.push(`Dump in progress: -${Math.abs(Math.round(priceH24))}% 24h, ${vitality.txns.h1.sells}:${vitality.txns.h1.buys} sell:buy ratio`);
    }
    
    // Exit scam pattern: paid DEX + crash
    if (dexStatus.hasDexPaid && priceH24 < -70) {
      healthScore -= 20;
      vitalityPenalties.push(`Paid DEX + ${Math.abs(Math.round(priceH24))}% crash — possible exit scam`);
    }
    
    // === CATASTROPHIC PRICE PENALTIES (replaces old single -10 for >60%) ===
    if (priceH24 < -90) {
      healthScore -= 35;
      vitalityPenalties.push(`Catastrophic crash: -${Math.abs(Math.round(priceH24))}% in 24h`);
    } else if (priceH24 < -80) {
      healthScore -= 25;
      vitalityPenalties.push(`Severe crash: -${Math.abs(Math.round(priceH24))}% in 24h`);
    } else if (priceH24 < -60) {
      healthScore -= 10;
      vitalityPenalties.push(`Price crash: -${Math.abs(Math.round(priceH24))}% in 24h`);
    }
    
    // Dead token: no volume + aged past initial period
    if (vol24 < 100 && pairAgeHours !== null && pairAgeHours > 6) {
      healthScore -= 20;
      vitalityPenalties.push(`Dead token: <$100 vol/24h after ${Math.floor(pairAgeHours)}h`);
    }
    
    // High dust penalty
    if (simpleTiers.dust.percentage > 75) {
      healthScore -= 15;
      vitalityPenalties.push(`Extreme dust: ${simpleTiers.dust.percentage.toFixed(0)}% of wallets under $1`);
    }
    
    // Top 5 concentration penalty
    if (distributionStats.top5Percentage > 60) {
      healthScore -= 15;
      vitalityPenalties.push(`Top 5 wallets hold ${distributionStats.top5Percentage.toFixed(0)}% of supply`);
    }
    
    // === ABSOLUTE FAILURE FLOORS (hard gates) ===
    // Real holders = total non-LP holders minus dust wallets
    const realHolderCount = nonLpHolders.length - simpleTiers.dust.count;
    
    if (realHolderCount < 15) {
      healthScore = Math.min(healthScore, 20);
      vitalityPenalties.push(`CRITICAL: Only ${realHolderCount} real holders (non-dust) — automatic F`);
    } else if (realHolderCount < 30) {
      healthScore = Math.min(healthScore, 45);
      vitalityPenalties.push(`WARNING: Only ${realHolderCount} real holders (non-dust) — capped at D`);
    }
    
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
    
    let healthGrade = 'A';
    if (healthScore >= 90) healthGrade = 'A';
    else if (healthScore >= 80) healthGrade = 'B';
    else if (healthScore >= 65) healthGrade = 'C';
    else if (healthScore >= 50) healthGrade = 'D';
    else healthGrade = 'F';

    // === HOLDER INTELLIGENCE (parallel, non-blocking) ===
    const top20Addresses = nonLpHolders.slice(0, 20).map(h => h.owner);
    const [flaggedHolders, historicalDelta, socialWarnings] = await Promise.all([
      crossLinkHolderReputation(top20Addresses),
      fetchHistoricalDelta(tokenMint),
      detectSocialChanges(tokenMint, socials),
    ]);
    
    // Add social removal warnings to risk flags
    for (const warning of socialWarnings) {
      riskFlags.push(warning);
    }
    
    // Add flagged holder warnings to risk flags
    if (flaggedHolders.length > 0) {
      const flagSummary = flaggedHolders.map(f => {
        const parts: string[] = [];
        if (f.is_blacklisted) parts.push('BLACKLISTED');
        if (f.trust_level) parts.push(f.trust_level);
        if (f.tokens_rugged && f.tokens_rugged > 0) parts.push(`${f.tokens_rugged} rugs`);
        return `${f.wallet_address.slice(0, 6)}...${f.wallet_address.slice(-4)}: ${parts.join(', ')}`;
      });
      riskFlags.push(`⚠️ ${flaggedHolders.length} flagged wallet(s) in top 20: ${flagSummary.join(' | ')}`);
    }
    
    // Compute historical deltas if we have prior data
    let hasHistoricalData = false;
    if (historicalDelta) {
      historicalDelta.holderCountChange = rankedHolders.length - historicalDelta.previousHolderCount;
      historicalDelta.healthScoreChange = healthScore - historicalDelta.previousHealthScore;
      historicalDelta.dustPctChange = simpleTiers.dust.percentage - historicalDelta.previousDustPct;
      historicalDelta.top5PctChange = distributionStats.top5Percentage - historicalDelta.previousTop5Pct;
      hasHistoricalData = true;
    }
    
    // Feed token lifecycle (fire and forget)
    feedTokenLifecycle(tokenMint, creatorInfo.wallet, tokenSymbol, launchpadInfo.name).catch(() => {});

    const totalTime = Date.now() - requestStartTime;
    console.log(`✅ [PERF] Request complete in ${totalTime}ms — ${rankedHolders.length} holders`);

    const result = {
      tokenMint,

      // Metadata (best-effort)
      symbol: tokenSymbol || null,
      name: tokenName || null,
      // Back-compat aliases (some clients historically used these)
      tokenSymbol: tokenSymbol || null,
      tokenName: tokenName || null,
      marketCap: inferredMarketCapUSD,

      totalHolders: rankedHolders.length,
      liquidityPoolsDetected: lpWallets.length,
      lpBalance,
      lpPercentageOfSupply: lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0,
      nonLpHolders: nonLpHolders.length,
      nonLpBalance,
      realWalletCount, bossWallets, kingpinWallets, superBossWallets, babyWhaleWallets,
      launchpadInfo, trueWhaleWallets, largeWallets, mediumWallets, smallWallets, dustWallets,
      totalBalance, tokenPriceUSD, priceSource,
      rpcSource: usedRpc,
      priceDiscoveryFailed,
      holders: rankedHolders,
      liquidityPools: lpWallets,
      potentialDevWallet,
      socials: Object.keys(socials).length > 0 ? socials : undefined,
      dexStatus,
      creatorInfo: Object.keys(creatorInfo).length > 0 ? creatorInfo : undefined,
      insidersGraph: insidersResult.hasInsiders ? insidersResult : undefined,

      // Vitality data — CRITICAL: passed to token-ai-interpreter for phase detection & analysis
      vitality,

      // Back-compat fields for UI widgets
      // Real Holders = Total Wallets - Dust Wallets (not a specific tier)
      realHolders: rankedHolders.length - dustWallets,
      dustPercentage: simpleTiers.dust.percentage,
      tierBreakdown: {
        dust: simpleTiers.dust.count,
        retail: simpleTiers.retail.count,
        serious: simpleTiers.serious.count,
        whale: simpleTiers.whales.count,
      },
      stabilityScore: healthScore,
      stabilityGrade: healthGrade,

      // NEW: Simplified tiers
      simpleTiers,
      // NEW: Distribution stats
      distributionStats,
      // NEW: Circulating supply excluding LP
      circulatingSupply: {
        tokens: circulatingSupplyExcludingLP,
        percentage: circulatingPercentage,
        usdValue: circulatingSupplyExcludingLP * tokenPriceUSD
      },
      // NEW: Risk flags
      riskFlags,
      // NEW: Health score
      healthScore: {
        score: healthScore,
        grade: healthGrade,
        phase: healthPhase,
        breakdown: healthBreakdown,
        vitalityPenalties,
        pairAgeHours: pairAgeHours ? Math.round(pairAgeHours) : null,
      },
      firstBuyers: [],
      executionTimeMs: totalTime
    };

    // Log complete search data (fire and forget - don't block response)
    logCompleteSearch(searchId, result, totalTime, rankedHolders.length).catch(e => 
      console.warn('[TokenSearchLogger] Background logging error:', e)
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    // Log failed search if we have a searchId
    if (searchId) {
      const totalTime = Date.now() - requestStartTime;
      logCompleteSearch(searchId, { tokenMint: 'unknown' }, totalTime, 0).catch(() => {});
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
