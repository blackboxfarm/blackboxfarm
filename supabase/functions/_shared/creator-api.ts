// Creator/Dev wallet API utilities
import type { LaunchpadInfo } from "./lp-detection.ts";

export interface CreatorInfo {
  wallet?: string;
  balance?: number;
  balanceUsd?: number;
  bondingCurveProgress?: number;
  xAccount?: string;
  feeSplit?: { wallet1?: string; wallet2?: string; splitPercent?: number };
}

export async function fetchCreatorInfo(launchpadInfo: LaunchpadInfo, tokenMint: string): Promise<CreatorInfo> {
  const creatorInfo: CreatorInfo = {};
  
  try {
    if (launchpadInfo.name.toLowerCase().includes('pump')) {
      console.log('[PumpFun] Fetching creator info...');
      const pumpResp = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (pumpResp.ok) {
        const pumpData = await pumpResp.json();
        creatorInfo.wallet = pumpData.creator;
        creatorInfo.bondingCurveProgress = pumpData.bonding_curve_progress;
        
        if (pumpData.twitter) {
          creatorInfo.xAccount = pumpData.twitter.startsWith('http') ? pumpData.twitter : `https://x.com/${pumpData.twitter}`;
        }
        
        console.log(`[PumpFun] Creator: ${creatorInfo.wallet}, Curve: ${creatorInfo.bondingCurveProgress}%`);
      }
    } else if (launchpadInfo.name.toLowerCase().includes('bonk')) {
      console.log('[BonkFun] Fetching creator info...');
      try {
        const bonkResp = await fetch(`https://api.bonk.fun/token/${tokenMint}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (bonkResp.ok) {
          const bonkData = await bonkResp.json();
          creatorInfo.wallet = bonkData.creator || bonkData.deployer;
          if (bonkData.twitter) {
            creatorInfo.xAccount = bonkData.twitter.startsWith('http') ? bonkData.twitter : `https://x.com/${bonkData.twitter}`;
          }
          console.log(`[BonkFun] Creator: ${creatorInfo.wallet}`);
        }
      } catch (e) {
        console.log('[BonkFun] API not available, skipping');
      }
    } else if (launchpadInfo.name.toLowerCase().includes('bags')) {
      console.log('[BagsFM] Fetching creator info...');
      try {
        const bagsResp = await fetch(`https://public-api-v2.bags.fm/api/v1/analytics/token-creators/${tokenMint}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (bagsResp.ok) {
          const bagsData = await bagsResp.json();
          if (bagsData.success && bagsData.response) {
            const creators = bagsData.response.filter((c: any) => c.isCreator);
            if (creators.length > 0) {
              creatorInfo.wallet = creators[0].wallet;
              if (creators[0].provider === 'twitter' && creators[0].providerUsername) {
                creatorInfo.xAccount = `https://x.com/${creators[0].providerUsername}`;
              }
              
              if (creators.length > 1) {
                creatorInfo.feeSplit = {
                  wallet1: creators[0].wallet,
                  wallet2: creators[1].wallet,
                  splitPercent: creators[0].splitPercent || 50
                };
              }
            }
            console.log(`[BagsFM] Creator: ${creatorInfo.wallet}, Split: ${creatorInfo.feeSplit ? 'Yes' : 'No'}`);
          }
        }
      } catch (e) {
        console.log('[BagsFM] API error, skipping');
      }
    }
  } catch (error) {
    console.error('[Creator Lookup] Error:', error);
  }
  
  return creatorInfo;
}
