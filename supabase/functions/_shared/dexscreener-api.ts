// DexScreener API utilities
import { detectLaunchpad, type LaunchpadInfo } from "./lp-detection.ts";
import { createApiLogger, type ServiceName } from "./api-logger.ts";

export interface DexStatus {
  hasDexPaid: boolean;
  hasCTO: boolean;
  activeBoosts: number;
  hasAds: boolean;
}

export interface Socials {
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface VitalityMetrics {
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  txns: { m5: { buys: number; sells: number }; h1: { buys: number; sells: number }; h6: { buys: number; sells: number }; h24: { buys: number; sells: number } };
  pairCreatedAt: number | null; // unix ms
  liquidityUsd: number;
  dexId: string | null; // e.g. 'pumpswap', 'raydium', 'orca'
}

export interface DexScreenerResult {
  pairs: any[];
  pairAddresses: Set<string>;
  launchpadInfo: LaunchpadInfo;
  socials: Socials;
  dexStatus: DexStatus;
  priceUsd: number;
  vitality: VitalityMetrics;
}

export async function fetchDexScreenerData(tokenMint: string): Promise<DexScreenerResult> {
  const zeroTxns = { buys: 0, sells: 0 };
  const result: DexScreenerResult = {
    pairs: [],
    pairAddresses: new Set(),
    launchpadInfo: { name: 'unknown', detected: false, confidence: 'low' },
    socials: {},
    dexStatus: { hasDexPaid: false, hasCTO: false, activeBoosts: 0, hasAds: false },
    priceUsd: 0,
    vitality: {
      volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
      priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 },
      txns: { m5: { ...zeroTxns }, h1: { ...zeroTxns }, h6: { ...zeroTxns }, h24: { ...zeroTxns } },
      pairCreatedAt: null,
      liquidityUsd: 0,
      dexId: null,
    }
  };

  try {
    console.log('[DexScreener] Fetching token pairs and orders in parallel...');
    
    // Create loggers for both calls
    const pairsLogger = createApiLogger({
      serviceName: 'dexscreener',
      endpoint: `/latest/dex/tokens/${tokenMint}`,
      tokenMint,
      functionName: 'fetchDexScreenerData',
      requestType: 'market_data',
    });
    
    const ordersLogger = createApiLogger({
      serviceName: 'dexscreener',
      endpoint: `/orders/v1/solana/${tokenMint}`,
      tokenMint,
      functionName: 'fetchDexScreenerData',
      requestType: 'market_data',
    });
    
    const [pairsResp, ordersResp] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`),
      fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenMint}`)
    ]);
    
    // Process pairs data
    if (pairsResp.ok) {
      await pairsLogger.complete(pairsResp.status);
      const dexData = await pairsResp.json();
      result.pairs = dexData.pairs || [];
      
      console.log(`[DexScreener] Found ${result.pairs.length} pairs`);
      
      for (const pair of result.pairs) {
        if (pair.pairAddress) {
          result.pairAddresses.add(pair.pairAddress);
          console.log(`  [DexScreener] Pair: ${pair.pairAddress} on ${pair.dexId}`);
        }
        
        if (pair.boosts?.active) {
          result.dexStatus.activeBoosts = Math.max(result.dexStatus.activeBoosts, pair.boosts.active);
        }
      }
      
      // Detect launchpad from first pair
      if (result.pairs.length > 0) {
        result.launchpadInfo = detectLaunchpad(result.pairs[0], tokenMint);
        console.log(`[DexScreener] Launchpad detected: ${result.launchpadInfo.name} (${result.launchpadInfo.confidence})`);
        
        // Get price
        const p0 = result.pairs[0];
        if (p0.priceUsd) {
          result.priceUsd = parseFloat(p0.priceUsd) || 0;
        }
        
        // Extract vitality metrics from first pair
        const vol = p0.volume || {};
        const pc = p0.priceChange || {};
        const tx = p0.txns || {};
        result.vitality = {
          volume: { m5: vol.m5 || 0, h1: vol.h1 || 0, h6: vol.h6 || 0, h24: vol.h24 || 0 },
          priceChange: { m5: pc.m5 || 0, h1: pc.h1 || 0, h6: pc.h6 || 0, h24: pc.h24 || 0 },
          txns: {
            m5: { buys: tx.m5?.buys || 0, sells: tx.m5?.sells || 0 },
            h1: { buys: tx.h1?.buys || 0, sells: tx.h1?.sells || 0 },
            h6: { buys: tx.h6?.buys || 0, sells: tx.h6?.sells || 0 },
            h24: { buys: tx.h24?.buys || 0, sells: tx.h24?.sells || 0 },
          },
          pairCreatedAt: p0.pairCreatedAt ? new Date(p0.pairCreatedAt).getTime() : null,
          liquidityUsd: p0.liquidity?.usd || 0,
        };
        console.log(`[DexScreener] Vitality — Vol24h: $${result.vitality.volume.h24}, Liq: $${result.vitality.liquidityUsd}, PairAge: ${result.vitality.pairCreatedAt ? Math.round((Date.now() - result.vitality.pairCreatedAt) / 3600000) + 'h' : 'N/A'}`);
        
        // Extract social links
        const info = result.pairs[0].info;
        if (info?.socials) {
          for (const social of info.socials) {
            if (social.type === 'twitter' && social.url) {
              result.socials.twitter = social.url;
            } else if (social.type === 'telegram' && social.url) {
              result.socials.telegram = social.url;
            }
          }
        }
        if (info?.websites?.length > 0) {
          const nonLaunchpadSite = info.websites.find((w: any) => 
            !w.url?.includes('pump.fun') && 
            !w.url?.includes('bonk.fun') && 
            !w.url?.includes('bags.fm') &&
            !w.url?.includes('dexscreener')
          );
          if (nonLaunchpadSite?.url) {
            result.socials.website = nonLaunchpadSite.url;
          }
        }
        console.log(`[DexScreener] Socials found:`, result.socials);
      }
    } else {
      await pairsLogger.complete(pairsResp.status, 'Non-OK response');
    }
    
    // Process orders data for paid status, CTO, ads
    if (ordersResp.ok) {
      await ordersLogger.complete(ordersResp.status);
      const ordersData = await ordersResp.json();
      const orders = ordersData?.orders || (Array.isArray(ordersData) ? ordersData : []);
      
      for (const order of orders) {
        if (order.status === 'approved') {
          if (order.type === 'tokenProfile') {
            result.dexStatus.hasDexPaid = true;
          }
          if (order.type === 'communityTakeover') {
            result.dexStatus.hasCTO = true;
          }
          if (order.type === 'tokenAd' || order.type === 'trendingBarAd') {
            result.dexStatus.hasAds = true;
          }
          // Also capture boosts from orders if not already detected from pairs
          if (order.type === 'boost' && order.amount) {
            result.dexStatus.activeBoosts = Math.max(result.dexStatus.activeBoosts, parseInt(order.amount) || 0);
          }
        }
      }
      
      console.log(`[DexScreener] Status - Paid: ${result.dexStatus.hasDexPaid}, CTO: ${result.dexStatus.hasCTO}, Boosts: ${result.dexStatus.activeBoosts}, Ads: ${result.dexStatus.hasAds}`);
    } else {
      await ordersLogger.complete(ordersResp.status, 'Non-OK response');
    }
  } catch (error) {
    console.error('[DexScreener] API error:', error);
  }

  return result;
}
