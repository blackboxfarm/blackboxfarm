import { withRunLog } from '../_shared/run-logger.ts';
import { upsertHealthSnapshot } from '../_shared/snapshot-writer.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { meshFeed } from "../_shared/mesh-feeder.ts"
import { writeEarlyWarnings, generateWarningsFromHoldersData, generatePatternWarnings } from "../_shared/early-warning-writer.ts"
import { detectLP, type LPDetectionResult, type LaunchpadInfo } from "../_shared/lp-detection.ts"
import { fetchDexScreenerData } from "../_shared/dexscreener-api.ts"
import { fetchCreatorInfo } from "../_shared/creator-api.ts"
import { fetchSolscanMarkets } from "../_shared/solscan-markets.ts"
import { fetchRugCheckInsiders, type InsidersGraphResult } from "../_shared/rugcheck-insiders.ts"
import { assertDbWrite } from "../_shared/db-assert.ts"
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
  matchKOLWallets,
  traceDevGenealogy,
  feedInsiderWallets,
  detectFreshWallets,
  expandGenealogyTree,
} from "../_shared/holder-intelligence.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(withRunLog('bagless-holders-report', async (req) => {
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
      dust: { count: 0, percentage: 0, supplyPercentage: 0, avgValue: 0, totalValue: 0 },
      retail: { count: 0, percentage: 0, supplyPercentage: 0, avgValue: 0, totalValue: 0 },
      serious: { count: 0, percentage: 0, supplyPercentage: 0, avgValue: 0, totalValue: 0 },
      whales: { count: 0, percentage: 0, supplyPercentage: 0, avgValue: 0, totalValue: 0 }
    };
    
    for (const h of nonLpHolders) {
      if (h.usdValue < 1) {
        simpleTiers.dust.count++;
        simpleTiers.dust.totalValue += h.usdValue;
        simpleTiers.dust.supplyPercentage += h.percentageOfSupply;
      } else if (h.usdValue < 200) {
        simpleTiers.retail.count++;
        simpleTiers.retail.totalValue += h.usdValue;
        simpleTiers.retail.supplyPercentage += h.percentageOfSupply;
      } else if (h.usdValue <= 1000) {
        simpleTiers.serious.count++;
        simpleTiers.serious.totalValue += h.usdValue;
        simpleTiers.serious.supplyPercentage += h.percentageOfSupply;
      } else {
        simpleTiers.whales.count++;
        simpleTiers.whales.totalValue += h.usdValue;
        simpleTiers.whales.supplyPercentage += h.percentageOfSupply;
      }
    }
    
    // Calculate holder count percentages and averages
    const totalNonLp = nonLpHolders.length;
    for (const tier of Object.values(simpleTiers)) {
      tier.percentage = totalNonLp > 0 ? (tier.count / totalNonLp) * 100 : 0;
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
    
    // === LIFECYCLE-AWARE HEALTH SCORE (Structural/Activity Split v2) ===
    const vitality = dexResult.vitality;
    const pairAgeMs = vitality.pairCreatedAt ? (Date.now() - vitality.pairCreatedAt) : null;
    const pairAgeHours = pairAgeMs ? pairAgeMs / 3600000 : null;
    
    // 8-phase detection
    type HealthPhase = 'on_curve' | 'newborn' | 'early' | 'adolescent' | 'established' | 'growth' | 'mature' | 'blue_chip';
    let healthPhase: HealthPhase = 'on_curve';
    
    const dexId = vitality.dexId || (dexResult.pairs?.[0]?.dexId) || null;
    const graduatedDex = dexId?.toLowerCase();
    const isGraduatedVenue = graduatedDex === 'pumpswap' || graduatedDex === 'raydium' || graduatedDex === 'orca' || graduatedDex === 'meteora';
    
    if (vitality.pairCreatedAt && (vitality.liquidityUsd > 50000 || isGraduatedVenue)) {
      if (pairAgeHours! < 2) healthPhase = 'newborn';
      else if (pairAgeHours! < 12) healthPhase = 'early';
      else if (pairAgeHours! < 48) healthPhase = 'adolescent';
      else if (pairAgeHours! < 168) healthPhase = 'established';
      else if (pairAgeHours! < 720) healthPhase = 'growth';
      else if (pairAgeHours! < 2160) healthPhase = 'mature';
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
    
    // ── STRUCTURAL METRICS (long-term health) ──
    // Solana-meme calibration:
    // (1) Holder count uses REAL participants (excludes dust wallets), then a soft dust penalty
    //     because a sea of $0.50 wallets does not equal a real holder base.
    const realHolderCount = Math.max(0, nonLpHolders.length - simpleTiers.dust.count);
    let holderCountScore = scoreMetric(realHolderCount, 400, 20);
    if (simpleTiers.dust.percentage > 55) holderCountScore *= 0.7;
    else if (simpleTiers.dust.percentage > 40) holderCountScore *= 0.85;
    holderCountScore = Math.round(holderCountScore);

    const whaleScore = scoreMetric(distributionStats.top5Percentage, 10, 50); // lower is better

    // (2) LP score is bucketed on absolute LP USD (memes commonly run 5–15% LP),
    //     not on percentage-of-supply. A small +5 bonus per secondary LP rewards multi-pool depth.
    const lpUsd = vitality.liquidityUsd || 0;
    let lpScoreRaw: number;
    if (lpUsd >= 50_000) lpScoreRaw = 100;
    else if (lpUsd >= 25_000) lpScoreRaw = 85;
    else if (lpUsd >= 10_000) lpScoreRaw = 70;
    else if (lpUsd >= 5_000) lpScoreRaw = 55;
    else if (lpUsd >= 2_000) lpScoreRaw = 40;
    else if (lpUsd >= 500) lpScoreRaw = 20;
    else lpScoreRaw = 5;
    // Future: when secondary-pool detection is wired in, += 5 per extra pool, capped at +15.
    const secondaryLps = (vitality as any).secondaryLpsCount ?? 0;
    const lpScore = Math.min(100, lpScoreRaw + Math.min(15, secondaryLps * 5));
    const bundledScore = scoreMetric(insidersResult.bundledPercentage, 0, 25); // lower is better
    const dustScore = scoreMetric(simpleTiers.dust.percentage, 10, 60); // lower is better
    const devPct = potentialDevWallet?.percentageOfSupply ?? 0;
    const isEarlyPhase = healthPhase === 'on_curve' || healthPhase === 'newborn' || healthPhase === 'early';
    const devThresholdGood = isEarlyPhase ? 15 : healthPhase === 'adolescent' ? 10 : 5;
    const devScore = scoreMetric(devPct, devThresholdGood, 40);
    
    // Longevity score: how long the token has survived
    let longevityScore = 0;
    if (pairAgeHours !== null) {
      if (pairAgeHours >= 2160) longevityScore = 100; // 90d+
      else if (pairAgeHours >= 720) longevityScore = 85;  // 30d+
      else if (pairAgeHours >= 168) longevityScore = 70;  // 7d+
      else if (pairAgeHours >= 48) longevityScore = 55;   // 2d+
      else if (pairAgeHours >= 12) longevityScore = 40;
      else if (pairAgeHours >= 2) longevityScore = 25;
      else longevityScore = 10;
    }
    
    // Holder retention score (based on dust ratio — high dust = poor retention)
    const retentionScore = scoreMetric(simpleTiers.dust.percentage, 5, 70); // lower dust = better retention
    
    // Structural score: weighted blend
    const structuralScore = Math.round(
      holderCountScore * 0.15 +
      whaleScore * 0.18 +
      lpScore * 0.15 +
      bundledScore * 0.15 +
      dustScore * 0.08 +
      devScore * 0.08 +
      longevityScore * 0.12 +
      retentionScore * 0.09
    );
    
    // ── ACTIVITY METRICS (short-term momentum) ──
    const txWindow = isEarlyPhase ? vitality.txns.h1 : vitality.txns.h24;
    const totalTxns = txWindow.buys + txWindow.sells;
    
    // Transaction activity score
    const txActivityScore = isEarlyPhase
      ? scoreMetric(vitality.txns.h1.buys + vitality.txns.h1.sells, 50, 0)
      : scoreMetric(vitality.txns.h24.buys + vitality.txns.h24.sells, 500, 5);
    
    // Buy/sell ratio
    const buySellRatio = totalTxns > 0 ? txWindow.buys / totalTxns : 0.5;
    const buySellScore = scoreMetric(buySellRatio, 0.7, 0.2);
    
    // Volume/MCap ratio
    const vol24 = vitality.volume.h24;
    const volToMcap = inferredMarketCapUSD > 0 ? (vol24 / inferredMarketCapUSD) : 0;
    const volumeScore = scoreMetric(volToMcap, 0.5, 0.01);
    
    // Price trend 24h
    const priceH24 = vitality.priceChange.h24;
    const priceTrendScore = scoreMetric(priceH24, 20, -50);
    
    // 6h/1h stability
    const priceH1 = vitality.priceChange.h1 ?? 0;
    const priceH6 = vitality.priceChange.h6 ?? 0;
    const stabilityScore6h1h = scoreMetric(
      Math.min(Math.abs(priceH1), Math.abs(priceH6)),
      0, 50 // 0% change is best, 50%+ is worst
    );
    // Invert: low abs change = high score
    const stabilityFinal = 100 - scoreMetric(Math.max(Math.abs(priceH1), Math.abs(priceH6)), 50, 0);
    
    // Activity score: weighted blend
    const activityScore = Math.round(
      txActivityScore * 0.20 +
      buySellScore * 0.20 +
      volumeScore * 0.20 +
      priceTrendScore * 0.20 +
      stabilityFinal * 0.20
    );
    
    // ── PHASE-BASED BLENDING ──
    const blendWeights: Record<HealthPhase, { structural: number; activity: number }> = {
      on_curve:    { structural: 0.40, activity: 0.60 },
      newborn:     { structural: 0.45, activity: 0.55 },
      early:       { structural: 0.50, activity: 0.50 },
      adolescent:  { structural: 0.55, activity: 0.45 },
      established: { structural: 0.60, activity: 0.40 },
      growth:      { structural: 0.65, activity: 0.35 },
      mature:      { structural: 0.75, activity: 0.25 },
      blue_chip:   { structural: 0.80, activity: 0.20 },
    };
    
    const blend = blendWeights[healthPhase];
    let healthScore = Math.round(structuralScore * blend.structural + activityScore * blend.activity);
    
    // ── HEALTH BREAKDOWN for UI ──
    const healthBreakdown: Record<string, { score: number; weight: number; contribution: number }> = {
      holders: { score: Math.round(holderCountScore), weight: 0.15, contribution: Math.round(holderCountScore * 0.15) },
      whales: { score: Math.round(whaleScore), weight: 0.18, contribution: Math.round(whaleScore * 0.18) },
      lp: { score: Math.round(lpScore), weight: 0.15, contribution: Math.round(lpScore * 0.15) },
      bundled: { score: Math.round(bundledScore), weight: 0.15, contribution: Math.round(bundledScore * 0.15) },
      dust: { score: Math.round(dustScore), weight: 0.08, contribution: Math.round(dustScore * 0.08) },
      dev: { score: Math.round(devScore), weight: 0.08, contribution: Math.round(devScore * 0.08) },
      volume: { score: Math.round(volumeScore), weight: 0.20, contribution: Math.round(volumeScore * 0.20) },
      buySell: { score: Math.round(buySellScore), weight: 0.20, contribution: Math.round(buySellScore * 0.20) },
      price: { score: Math.round(priceTrendScore), weight: 0.20, contribution: Math.round(priceTrendScore * 0.20) },
    };
    
    // ── CAPPED MODIFIER BUCKETS ──
    const vitalityPenalties: string[] = [];
    let activityPenalty = 0;   // cap: -12
    let structuralPenalty = 0; // cap: -15
    let catastrophicPenalty = 0; // cap: -35
    
    // === BONDING CURVE PROGRESS ADJUSTMENT (on_curve only) ===
    if (healthPhase === 'on_curve' && creatorInfo.bondingCurveProgress !== undefined) {
      const bcp = creatorInfo.bondingCurveProgress;
      if (bcp > 80) {
        healthScore += 10;
        vitalityPenalties.push(`Graduation imminent: ${bcp.toFixed(0)}% bonding curve`);
      } else if (bcp < 20) {
        activityPenalty += 10;
        vitalityPenalties.push(`Low bonding curve progress: ${bcp.toFixed(0)}%`);
      }
    }
    
    // ── ACTIVITY WEAKNESS BUCKET (cap -12) ──
    if (healthPhase !== 'on_curve') {
      if (vol24 < 500 && nonLpHolders.length > 100) {
        activityPenalty += 8;
        vitalityPenalties.push('Volume collapse (<$500/24h)');
      }
      if (vitality.txns.h1.buys + vitality.txns.h1.sells === 0) {
        activityPenalty += 6;
        vitalityPenalties.push('Zero transactions in last hour');
      }
    }
    
    // Dead/sleeper on curve
    if (healthPhase === 'on_curve' && pairAgeHours === null) {
      const totalTxns1h = vitality.txns.h1.buys + vitality.txns.h1.sells;
      if (vol24 < 100 && totalTxns1h === 0) {
        activityPenalty += 12;
        vitalityPenalties.push('Dead on curve: zero activity, never bonded');
      } else if (vol24 < 1000 && totalTxns1h < 5) {
        activityPenalty += 8;
        vitalityPenalties.push('Sleeper on curve: minimal activity, not bonded');
      }
    } else if (healthPhase === 'on_curve' && pairAgeHours !== null && pairAgeHours >= 24) {
      const totalTxns1h = vitality.txns.h1.buys + vitality.txns.h1.sells;
      if (vol24 < 100 && totalTxns1h === 0) {
        activityPenalty += 12;
        vitalityPenalties.push(`Dead on curve: ${Math.floor(pairAgeHours)}h old, zero activity`);
      } else if (vol24 < 1000 && totalTxns1h < 5) {
        activityPenalty += 10;
        vitalityPenalties.push(`Sleeper on curve: ${Math.floor(pairAgeHours)}h old, tiny activity`);
      }
    }
    
    // ── Pre-compute totals for use in penalty logic (realHolderCount already defined above) ──
    const totalHolderCount = rankedHolders.length;
    const totalTxns24h = vitality.txns.h24.buys + vitality.txns.h24.sells;
    
    // ── STRUCTURAL WEAKNESS BUCKET (cap -15) ──
    if (simpleTiers.dust.percentage > 75) {
      structuralPenalty += 8;
      vitalityPenalties.push(`Extreme dust: ${simpleTiers.dust.percentage.toFixed(0)}% of wallets under $1`);
    }
    if (distributionStats.top5Percentage > 60) {
      structuralPenalty += 10;
      vitalityPenalties.push(`Top 5 wallets hold ${distributionStats.top5Percentage.toFixed(0)}% of supply`);
    }
    
    // ── CATASTROPHIC BUCKET (cap -35) ── 
    // These represent true failures: rugs, collapses, exit scams
    
    // Bleed arc: sustained downtrend across timeframes
    if (priceH1 < -30 && priceH6 < -60) {
      catastrophicPenalty += 15;
      vitalityPenalties.push(`Bleed arc: -${Math.abs(Math.round(priceH1))}% 1h, -${Math.abs(Math.round(priceH6))}% 6h`);
    }
    
    // Dump in progress: massive crash + sell-heavy order flow
    if (priceH24 < -80 && vitality.txns.h1.sells > vitality.txns.h1.buys * 3) {
      catastrophicPenalty += 20;
      vitalityPenalties.push(`Dump in progress: -${Math.abs(Math.round(priceH24))}% 24h, ${vitality.txns.h1.sells}:${vitality.txns.h1.buys} sell:buy ratio`);
    }
    
    // Exit scam pattern: paid DEX + crash
    if (dexStatus.hasDexPaid && priceH24 < -70) {
      catastrophicPenalty += 15;
      vitalityPenalties.push(`Paid DEX + ${Math.abs(Math.round(priceH24))}% crash — possible exit scam`);
    }
    
    // Catastrophic price crashes
    if (priceH24 < -90) {
      catastrophicPenalty += 25;
      vitalityPenalties.push(`Catastrophic crash: -${Math.abs(Math.round(priceH24))}% in 24h`);
    } else if (priceH24 < -80) {
      catastrophicPenalty += 15;
      vitalityPenalties.push(`Severe crash: -${Math.abs(Math.round(priceH24))}% in 24h`);
    }
    
    // Dead token: no volume + aged past initial period
    // BUT exempt tokens with substantial holder bases — they're dormant, not dead
    const hasSubstantialHolders = realHolderCount >= 500;
    if (vol24 < 100 && pairAgeHours !== null && pairAgeHours > 6 && !hasSubstantialHolders) {
      catastrophicPenalty += 15;
      vitalityPenalties.push(`Dead token: <$100 vol/24h after ${Math.floor(pairAgeHours)}h`);
    } else if (vol24 < 100 && pairAgeHours !== null && pairAgeHours > 6 && hasSubstantialHolders) {
      // Dormant but structurally alive — activity penalty only, not catastrophic
      activityPenalty += 10;
      vitalityPenalties.push(`Dormant volume: <$100 vol/24h but ${realHolderCount.toLocaleString()} real holders — downgraded to activity penalty`);
    }
    
    // Apply capped penalties
    const cappedActivity = Math.min(activityPenalty, 12);
    const cappedStructural = Math.min(structuralPenalty, 15);
    const cappedCatastrophic = Math.min(catastrophicPenalty, 35);
    healthScore -= (cappedActivity + cappedStructural + cappedCatastrophic);
    
    if (cappedActivity > 0 || cappedStructural > 0 || cappedCatastrophic > 0) {
      const parts: string[] = [];
      if (cappedActivity > 0) parts.push(`activity: -${cappedActivity}${activityPenalty > 12 ? ' (capped from -' + activityPenalty + ')' : ''}`);
      if (cappedStructural > 0) parts.push(`structural: -${cappedStructural}${structuralPenalty > 15 ? ' (capped from -' + structuralPenalty + ')' : ''}`);
      if (cappedCatastrophic > 0) parts.push(`catastrophic: -${cappedCatastrophic}${catastrophicPenalty > 35 ? ' (capped from -' + catastrophicPenalty + ')' : ''}`);
      console.log(`[health] Capped penalties: ${parts.join(', ')}`);
    }
    
    // ── ABSOLUTE FAILURE FLOORS (hard gates) ──
    const bondingCurvePct = typeof creatorInfo.bondingCurveProgress === 'number' ? creatorInfo.bondingCurveProgress : null;
    const isPumpLaunch = (launchpadInfo.name || '').toLowerCase().includes('pump') || dexId?.toLowerCase() === 'pumpfun';
    const ungraduatedPump = isPumpLaunch && !isGraduatedVenue && healthPhase === 'on_curve';
    const hardDeadCurve = ungraduatedPump && inferredMarketCapUSD > 0 && inferredMarketCapUSD < 5_000;
    const stalledLowCurve = ungraduatedPump && bondingCurvePct !== null && bondingCurvePct < 70 && pairAgeHours !== null && pairAgeHours > 2 && vol24 < 2_500;
    const hardFailureOverride = hardDeadCurve || stalledLowCurve;

    if (hardFailureOverride) {
      healthScore = Math.min(healthScore, 25);
      vitalityPenalties.push(
        hardDeadCurve
          ? `DEAD/RUG OVERRIDE: ungraduated Pump.fun token under $5k market cap ($${Math.round(inferredMarketCapUSD).toLocaleString()}) — automatic F`
          : `DEAD/RUG OVERRIDE: stalled bonding curve (${bondingCurvePct?.toFixed(0)}%) with weak volume — automatic F`
      );
    }

    if (realHolderCount < 15) {
      healthScore = Math.min(healthScore, 20);
      vitalityPenalties.push(`CRITICAL: Only ${realHolderCount} real holders (non-dust) — automatic F`);
    } else if (realHolderCount < 30) {
      healthScore = Math.min(healthScore, 45);
      vitalityPenalties.push(`WARNING: Only ${realHolderCount} real holders (non-dust) — capped at D`);
    }
    
    // ── MARKET MATURITY FLOORS ──
    // Traditional floors: disabled by catastrophic flags
    const hasCatastrophic = cappedCatastrophic > 0;
    
    if (!hasCatastrophic) {
      if (inferredMarketCapUSD >= 25_000_000 && totalHolderCount >= 10000 && vitality.liquidityUsd >= 250_000 && totalTxns24h >= 100) {
        const floor = 82; // B+
        if (healthScore < floor) {
          vitalityPenalties.push(`Blue chip floor (B+): $${(inferredMarketCapUSD / 1e6).toFixed(1)}M mcap + ${totalHolderCount.toLocaleString()} holders → raised from ${Math.round(healthScore)} to ${floor}`);
          healthScore = floor;
        }
      } else if (inferredMarketCapUSD >= 10_000_000 && totalHolderCount >= 5000 && vitality.liquidityUsd >= 100_000 && totalTxns24h >= 50) {
        const floor = 76; // B
        if (healthScore < floor) {
          vitalityPenalties.push(`Mature floor (B): $${(inferredMarketCapUSD / 1e6).toFixed(1)}M mcap + ${totalHolderCount.toLocaleString()} holders → raised from ${Math.round(healthScore)} to ${floor}`);
          healthScore = floor;
        }
      } else if (inferredMarketCapUSD >= 1_000_000 && totalHolderCount >= 500 && vitality.liquidityUsd >= 50_000) {
        const floor = 65; // C+
        if (healthScore < floor) {
          vitalityPenalties.push(`Growth floor (C+): $${(inferredMarketCapUSD / 1e6).toFixed(1)}M mcap + ${totalHolderCount.toLocaleString()} holders → raised from ${Math.round(healthScore)} to ${floor}`);
          healthScore = floor;
        }
      }
    }
    
    // ── STRUCTURAL HOLDER FLOORS (independent of volume/liquidity/catastrophic) ──
    // A token with thousands of REAL holders (non-dust) is NOT an F regardless of current volume.
    // These floors ALWAYS apply — real holder count is an immutable structural fact.
    if (!hardFailureOverride && realHolderCount >= 5000) {
      const holderFloor = 89; // A
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Massive holder floor (A): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    } else if (!hardFailureOverride && realHolderCount >= 2000) {
      const holderFloor = 80; // B+
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Large holder floor (B+): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    } else if (!hardFailureOverride && realHolderCount >= 1000) {
      const holderFloor = 70; // B-
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Solid holder floor (B-): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    } else if (!hardFailureOverride && realHolderCount >= 500) {
      const holderFloor = 60; // C
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Holder floor (C): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    } else if (!hardFailureOverride && realHolderCount >= 200) {
      const holderFloor = 50; // D+
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Moderate holder floor (D+): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    } else if (!hardFailureOverride && realHolderCount >= 100) {
      const holderFloor = 45; // D
      if (healthScore < holderFloor) {
        vitalityPenalties.push(`Small holder floor (D): ${realHolderCount.toLocaleString()} real holders → raised from ${Math.round(healthScore)} to ${holderFloor}`);
        healthScore = holderFloor;
      }
    }
    
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
    
    // ── 14-TIER GRADING ──
    const scoreToGrade = (s: number): string => {
      if (s >= 97) return 'A++';
      if (s >= 93) return 'A+';
      if (s >= 89) return 'A';
      if (s >= 85) return 'A-';
      if (s >= 80) return 'B+';
      if (s >= 75) return 'B';
      if (s >= 70) return 'B-';
      if (s >= 65) return 'C+';
      if (s >= 60) return 'C';
      if (s >= 55) return 'C-';
      if (s >= 50) return 'D+';
      if (s >= 45) return 'D';
      if (s >= 40) return 'D-';
      return 'F';
    };
    
    let healthGrade = scoreToGrade(healthScore);
    
    // Activity momentum grade (separate dimension)
    const momentumGrade = scoreToGrade(activityScore);

    // === HOLDER INTELLIGENCE (parallel, non-blocking) ===
    const top20Addresses = nonLpHolders.slice(0, 20).map(h => h.owner);
    const allHolderAddresses = nonLpHolders.slice(0, 50).map(h => h.owner);
    
    // Determine token creation time for fresh wallet detection
    const tokenCreatedAt: string | null = creatorInfo.createdTimestamp 
      ? new Date(creatorInfo.createdTimestamp * 1000).toISOString() 
      : (vitality?.pairCreatedAt ? String(vitality.pairCreatedAt) : null);
    
    const [flaggedHolders, historicalDelta, socialWarnings, kolMatches, devGenealogy, freshWallets] = await Promise.all([
      crossLinkHolderReputation(top20Addresses),
      fetchHistoricalDelta(tokenMint),
      detectSocialChanges(tokenMint, socials),
      matchKOLWallets(allHolderAddresses),
      traceDevGenealogy(creatorInfo.wallet),
      detectFreshWallets(top20Addresses, tokenCreatedAt),
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
    
    // Add fresh wallet warnings to risk flags (structural penalty, capped)
    if (freshWallets) {
      if (freshWallets.clusterDetected) {
        riskFlags.push(`🤖 SYBIL ALERT: ${freshWallets.freshWalletCount}/${freshWallets.totalChecked} top holders have fresh wallets created within ${freshWallets.clusterWindowHours}h window`);
        healthScore = Math.max(0, healthScore - 15);
        vitalityPenalties.push(`Fresh wallet cluster: ${freshWallets.freshPercentage}% of top 20 holders created around same time`);
      } else if (freshWallets.freshPercentage >= 40) {
        riskFlags.push(`⚠️ ${freshWallets.freshPercentage}% of top 20 holders have recently-created wallets`);
        healthScore = Math.max(0, healthScore - 8);
        vitalityPenalties.push(`High fresh wallet ratio: ${freshWallets.freshPercentage}%`);
      }
    }
    
    // Recompute grade after fresh wallet penalties
    healthGrade = scoreToGrade(healthScore);
    
    let hasHistoricalData = false;
    if (historicalDelta) {
      historicalDelta.holderCountChange = rankedHolders.length - historicalDelta.previousHolderCount;
      historicalDelta.healthScoreChange = healthScore - historicalDelta.previousHealthScore;
      historicalDelta.dustPctChange = simpleTiers.dust.percentage - historicalDelta.previousDustPct;
      historicalDelta.top5PctChange = distributionStats.top5Percentage - historicalDelta.previousTop5Pct;
      hasHistoricalData = true;
    }
    
    // Feed token lifecycle + insider mesh (fire and forget)
    feedTokenLifecycle(tokenMint, creatorInfo.wallet, tokenSymbol, launchpadInfo.name).catch(() => {});
    if (insidersResult.hasInsiders && insidersResult.bundledPercentage > 2) {
      feedInsiderWallets(
        tokenMint,
        insidersResult.bundledWallets,
        insidersResult.bundledPercentage,
        insidersResult.clusters
      ).catch(() => {});
    }
    
    // 🕸️ MESH FEEDER: Every holders analysis feeds the mesh
    const supabaseForMesh = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    meshFeed.token(supabaseForMesh, {
      mint: tokenMint,
      symbol: tokenSymbol,
      name: tokenName,
      creatorWallet: creatorInfo.wallet,
      twitterUrl: socials?.twitter,
      telegramUrl: socials?.telegram,
      websiteUrl: socials?.website,
      source: 'bagless-holders-report',
    }).catch(e => console.warn('[mesh-feeder] holders report feed failed:', e));
    
    // Feed insiders into mesh
    if (insidersResult.hasInsiders && insidersResult.bundledWallets?.length > 0) {
      meshFeed.insiders(supabaseForMesh, {
        tokenMint,
        insiderWallets: insidersResult.bundledWallets.map((w: any) => w.wallet || w),
        source: 'bagless-holders-report',
      }).catch(e => console.warn('[mesh-feeder] insiders feed failed:', e));
    }
    
    // Incremental genealogy tree expansion (fire and forget)
    if (devGenealogy?.alreadyKnown && devGenealogy.parentWallets.length > 0) {
      expandGenealogyTree(
        devGenealogy.creatorWallet,
        devGenealogy.parentWallets.map(p => p.wallet),
      ).catch(() => {});
    }

    // 🚨 EARLY WARNING WRITER: Populate cumulative warning cache (fire and forget)
    const earlyWarningResult = {
      symbol: tokenSymbol, tokenSymbol, marketCap: inferredMarketCapUSD,
      simpleTiers, distributionStats, lpPercentageOfSupply: lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0,
      insidersGraph: insidersResult.hasInsiders ? insidersResult : undefined,
      insiderClusters: insidersResult.clusters.length > 0 ? insidersResult.clusters : undefined,
      vitality, freshWallets, healthScore: { score: healthScore },
      stabilityScore: healthScore,
    };
    const holdersWarnings = generateWarningsFromHoldersData(tokenMint, earlyWarningResult, 'bagless-holders-report');
    
    // Also check post-mortem pattern rules against current metrics
    const lpPctVal = lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0;
    const patternWarnings = await generatePatternWarnings(tokenMint, {
      whale_supply_pct: simpleTiers.whales?.supplyPercentage || 0,
      dust_pct: simpleTiers.dust?.percentage || 0,
      top10_pct: distributionStats?.top10Percentage || 0,
      health_score: healthScore,
      dev_sold_all: false, // Not available here
      has_twitter: !!(vitality as any)?.info?.socials?.find((s: any) => s.type === 'twitter'),
      bundled_pct: insidersResult?.bundledPercentage || 0,
      lp_pct: lpPctVal,
      volume_mcap_ratio: inferredMarketCapUSD > 0 ? (vitality?.volume?.h24 || 0) / inferredMarketCapUSD : 0,
    }, 'bagless-holders-report', supabaseForMesh).catch(() => [] as any[]);

    const allWarnings = [...holdersWarnings, ...patternWarnings];
    if (allWarnings.length > 0) {
      writeEarlyWarnings(allWarnings, supabaseForMesh).catch(e =>
        console.warn('[early-warning-writer] holders report warnings failed:', e)
      );
    }

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
        structuralScore,
        activityScore,
        momentumGrade,
      },
      // Intelligence data
      flaggedHolders: flaggedHolders.length > 0 ? flaggedHolders : undefined,
      historicalDelta: hasHistoricalData ? historicalDelta : undefined,
      hasHistoricalData,
      bondingCurveProgress: creatorInfo.bondingCurveProgress ?? null,
      kolMatches: kolMatches.length > 0 ? kolMatches : undefined,
      kolCount: kolMatches.length,
      devGenealogy: devGenealogy || undefined,
      insiderClusters: insidersResult.clusters.length > 0 ? insidersResult.clusters : undefined,
      freshWallets: freshWallets || undefined,
      
      firstBuyers: [],
      executionTimeMs: totalTime
    };

    // Log complete search data (fire and forget - don't block response)
    logCompleteSearch(searchId, result as any, totalTime, rankedHolders.length).catch(e => 
      console.warn('[TokenSearchLogger] Background logging error:', e)
    );

    // Write health snapshot for Litmus Strip. This is a primary stats write:
    // if it fails, the run must fail loudly instead of returning a fake success.
    await upsertHealthSnapshot(supabaseForMesh, {
      tokenMint,
      healthScore,
      healthGrade,
      totalHolders: rankedHolders.length,
      realHolders: rankedHolders.length - dustWallets,
      dustPercentage: simpleTiers.dust.percentage,
      whaleCount: simpleTiers.whales.count,
      top10Pct: distributionStats?.top10Percentage ?? null,
      source: 'holders_query',
    });

    // Upsert into holders_intel_seen_tokens — every scan grows the intelligence layer
    await assertDbWrite(
      supabaseForMesh.from('holders_intel_seen_tokens').upsert({
        token_mint: tokenMint,
        symbol: tokenSymbol || null,
        name: tokenName || null,
        last_seen_at: new Date().toISOString(),
        times_seen: 1, // Will increment via ON CONFLICT if supported, otherwise just marks seen
        market_cap_at_discovery: inferredMarketCapUSD || null,
        health_grade: healthGrade || null,
      }, { onConflict: 'token_mint' }),
      'holders_intel_seen_tokens',
      'UPSERT',
    );
    console.log(`[bagless] ✅ Upserted ${tokenMint.slice(0,8)} into seen_tokens`);

    // 🪣 Hydrate pumpfun_watchlist with this scan's decision data so the admin
    // Token Funnel Pool reflects real holder/grade/MC values instead of zeros.
    // This is not optional. The table must reflect the fetched scan facts.
    {
        const { data: existingWl } = await supabaseForMesh
          .from('pumpfun_watchlist')
          .select('id, ath_market_cap_usd, price_ath_usd, holder_count_peak')
          .eq('token_mint', tokenMint)
          .maybeSingle();

        const totalHolders = rankedHolders.length;
        const realHolders = totalHolders - dustWallets;
        const hydrate: Record<string, unknown> = {
          last_checked_at: new Date().toISOString(),
          last_snapshot_at: new Date().toISOString(),
          last_processor: 'bagless-holders-report',
          token_symbol: tokenSymbol || null,
          token_name: tokenName || null,
          image_url: dexPair0?.info?.imageUrl || null,
          twitter_url: socials?.twitter || null,
          telegram_url: socials?.telegram || null,
          website_url: socials?.website || null,
          holder_count: totalHolders,
        };
        if (vitality?.pairCreatedAt) hydrate.created_at_blockchain = new Date(vitality.pairCreatedAt).toISOString();
        if (typeof tokenPriceUSD === 'number' && tokenPriceUSD > 0) {
          hydrate.price_usd = tokenPriceUSD;
          hydrate.price_current = tokenPriceUSD;
        }
        if (typeof inferredMarketCapUSD === 'number' && inferredMarketCapUSD > 0) {
          hydrate.market_cap_usd = inferredMarketCapUSD;
        }
        if (typeof vitality?.liquidityUsd === 'number' && vitality.liquidityUsd > 0) {
          hydrate.liquidity_usd = vitality.liquidityUsd;
        }
        if (creatorInfo?.wallet) hydrate.creator_wallet = creatorInfo.wallet;
        if (typeof creatorInfo?.bondingCurveProgress === 'number') {
          hydrate.bonding_curve_pct = creatorInfo.bondingCurveProgress;
        }

        if (typeof inferredMarketCapUSD === 'number' && inferredMarketCapUSD > (existingWl?.ath_market_cap_usd ?? 0)) {
          hydrate.ath_market_cap_usd = inferredMarketCapUSD;
          hydrate.ath_market_cap_at = new Date().toISOString();
        }
        if (typeof tokenPriceUSD === 'number' && tokenPriceUSD > (existingWl?.price_ath_usd ?? 0)) {
          hydrate.price_ath_usd = tokenPriceUSD;
        }
        hydrate.holder_count_peak = Math.max(existingWl?.holder_count_peak ?? 0, totalHolders);

        if (existingWl?.id) {
          await assertDbWrite(
            supabaseForMesh.from('pumpfun_watchlist').update(hydrate).eq('id', existingWl.id),
            'pumpfun_watchlist',
            'UPDATE',
          );
          console.log(`[bagless] 🪣 Hydrated pumpfun_watchlist row for ${tokenMint.slice(0, 8)}`);
        } else {
          await assertDbWrite(
            supabaseForMesh.from('pumpfun_watchlist').upsert(
              { token_mint: tokenMint, status: 'pending_triage', source: 'bagless-holders-report', ...hydrate },
              { onConflict: 'token_mint' }
            ),
            'pumpfun_watchlist',
            'UPSERT',
          );
          console.log(`[bagless] 🪣 Created+hydrated pumpfun_watchlist row for ${tokenMint.slice(0, 8)}`);
        }
    }

    // Stamp telegram_insider_token_lifecycle.holders_refreshed_at so the
    // no-lube-orchestrate Big Picture eligibility gate can unblock. This is
    // the column it reads; if we don't write it here nothing else does, and
    // the public-channel re-sighting flow can never trigger.
    try {
      await supabaseForMesh
        .from('telegram_insider_token_lifecycle')
        .update({ holders_refreshed_at: new Date().toISOString() })
        .eq('token_mint', tokenMint);
    } catch (e) {
      console.warn('[bagless] stamp holders_refreshed_at failed (non-fatal):', (e as Error).message);
    }

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
      JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));