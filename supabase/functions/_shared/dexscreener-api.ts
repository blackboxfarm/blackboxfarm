// DexScreener API utilities
import { detectLaunchpad, type LaunchpadInfo } from "./lp-detection.ts";

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

export interface DexScreenerResult {
  pairs: any[];
  pairAddresses: Set<string>;
  launchpadInfo: LaunchpadInfo;
  socials: Socials;
  dexStatus: DexStatus;
  priceUsd: number;
}

export async function fetchDexScreenerData(tokenMint: string): Promise<DexScreenerResult> {
  const result: DexScreenerResult = {
    pairs: [],
    pairAddresses: new Set(),
    launchpadInfo: { name: 'unknown', detected: false, confidence: 'low' },
    socials: {},
    dexStatus: { hasDexPaid: false, hasCTO: false, activeBoosts: 0, hasAds: false },
    priceUsd: 0
  };

  try {
    console.log('[DexScreener] Fetching token pairs and orders in parallel...');
    
    const [pairsResp, ordersResp] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`),
      fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenMint}`)
    ]);
    
    // Process pairs data
    if (pairsResp.ok) {
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
        if (result.pairs[0].priceUsd) {
          result.priceUsd = parseFloat(result.pairs[0].priceUsd) || 0;
        }
        
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
    }
    
    // Process orders data for paid status, CTO, ads
    if (ordersResp.ok) {
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
    }
  } catch (error) {
    console.error('[DexScreener] API error:', error);
  }

  return result;
}
