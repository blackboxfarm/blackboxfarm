/**
 * Shared LP Detection Constants
 * 
 * Centralized program IDs, wallet addresses, and detection utilities
 * for consistent LP detection across all edge functions.
 */

// ============================================
// KNOWN DEX PROGRAM IDS
// ============================================

export const KNOWN_DEX_PROGRAMS: Record<string, string> = {
  // Pump.fun ecosystem
  'Pump.fun AMM': '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  'Pump.fun Bonding Curve': 'PumpkFHPjXpQWCNPxhj3mwmEzxxDfRJqr1yBqNLR3cg',
  
  // Note: Bags.fm and Bonk.fun use Pump.fun infrastructure (same program IDs)
  // These are separate programs only if they have unique program IDs
  'Moonshot': 'MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG',
  
  // Raydium ecosystem
  'Raydium V4': '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'Raydium CLMM': 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  'Raydium V3': '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyytg3Ct',
  'Raydium LaunchLab': 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
  'Raydium CP-Swap': 'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW',
  'Raydium Stable': '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h',
  
  // Orca ecosystem
  'Orca Whirlpool': 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  'Orca V2': '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  'Orca V1': 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1',
  
  // Meteora ecosystem
  'Meteora DLMM': 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  'Meteora DLMM V2': 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
  'Meteora Pools': 'EyGdBX4EHWvZhG8kEF39yvEPBHcEF2ZaKGrYdcBCTm6h',
  'Meteora Dynamic': 'Gswppe6ERWKpUTXvRPfXdzHhiCyJvLadVvXGfdpBqcE1',
  
  // Jupiter
  'Jupiter LO': 'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu',
  'Jupiter V6': 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  
  // OpenBook / Serum
  'OpenBook V2': 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb',
  'OpenBook V1': 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
  'Serum V3': '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
  
  // Other DEXs
  'Fluxbeam': 'FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X',
  'Lifinity V2': '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c',
  'Lifinity V1': 'EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S',
  'Aldrin V2': 'CURVGoZn8zycx6FXwwevgBTB2gVvdbGTEpvMJDbgs2t4',
  'Cropper': 'H8W3ctz92svYg6mkn1UtGfu2aQr2fnUFHM1RhScEtQDt',
  'Saros': 'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ',
  'Phoenix': 'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',
  'GooseFX': 'GFXsSL5sSaDfNFQUYsHekbWBW1TsFdjDYzACh62tEHxn',
};

// ============================================
// KNOWN BONDING CURVE PROGRAMS
// ============================================

// Known bonding curve and launchpad program IDs
// Note: bags.fm and bonk.fun use Pump.fun infrastructure (same program)
export const BONDING_CURVE_PROGRAMS: Record<string, string> = {
  'Pump.fun': '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  'Pump.fun Bonding': 'PumpkFHPjXpQWCNPxhj3mwmEzxxDfRJqr1yBqNLR3cg',
  'Moonshot': 'MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG',
};

// ============================================
// KNOWN LP WALLET ADDRESSES
// ============================================

export const KNOWN_LP_WALLETS = new Set([
  // Pump.fun bonding curve and fee wallets
  'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
  '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
  'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1', // Pump.fun migration wallet
  'BVMxnagMaVBDtVFkSy2n9sVZpL2E2HNwMnvMECNRSqWM', // Pump.fun treasury
  
  // Raydium LP authorities and vaults
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5',
  'Hq1fCvvjNLf75h1LDoxZ5izJVmxNWjPzWd4sGgw6suGq',
  '3uaZBfHPfmpAHW7dsimC1SnyR61X4bJqQZKWmRSCXJxv', // Raydium AMM authority
  'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ', // Raydium authority
  
  // Meteora DLMM
  '6C4d4fQo9qupzMWkVN5BbPnHQf9wKDBRSCLbJMM7xWr7',
  
  // Orca vaults
  'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1',
  
  // Common LP/pool wallets seen across platforms
  'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM', // Token Standard LP
  
  // Burn addresses (tokens locked forever)
  '1nc1nerator11111111111111111111111111111111',
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef11',
]);

// ============================================
// BURN ADDRESSES
// ============================================

export const BURN_ADDRESSES = new Set([
  '11111111111111111111111111111111', // System Program (null address)
  'So11111111111111111111111111111111111111112', // Native SOL mint
  '1nc1nerator11111111111111111111111111111111', // Incinerator
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program itself
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef11', // Common burn pattern
]);

// ============================================
// LP DETECTION INTERFACE
// ============================================

export interface LPDetectionResult {
  isLP: boolean;
  confidence: number; // 0-100
  platform: string | null;
  reason: string | null;
  source: 'solscan_verified' | 'dexscreener_pool' | 'known_wallet' | 'program_id' | 'heuristic' | 'burned' | null;
}

// ============================================
// LP DETECTION FUNCTION
// ============================================

/**
 * Detect if a wallet is a liquidity pool based on multiple signals
 * 
 * @param owner - The wallet address (token account owner)
 * @param accountOwner - The program ID that owns the token account
 * @param percentageOfSupply - The percentage of total supply held
 * @param verifiedPoolAddresses - Set of verified pool addresses from Solscan/DexScreener
 * @param dexScreenerPairAddresses - Set of pair addresses from DexScreener
 * @returns LPDetectionResult
 */
export function detectLP(
  owner: string,
  accountOwner: string,
  percentageOfSupply: number,
  verifiedPoolAddresses: Set<string> = new Set(),
  dexScreenerPairAddresses: Set<string> = new Set()
): LPDetectionResult {
  
  // Priority 1: Direct pool address match from Solscan (100% confidence)
  if (verifiedPoolAddresses.has(owner)) {
    return {
      isLP: true,
      confidence: 100,
      platform: 'Solscan Verified Pool',
      reason: 'Matched Solscan-verified pool address',
      source: 'solscan_verified'
    };
  }
  
  // Priority 2: DexScreener pair address match (98% confidence)
  if (dexScreenerPairAddresses.has(owner)) {
    return {
      isLP: true,
      confidence: 98,
      platform: 'DexScreener Pool',
      reason: 'Matched DexScreener pair address',
      source: 'dexscreener_pool'
    };
  }
  
  // Priority 3: Known static LP wallets (99% confidence)
  if (KNOWN_LP_WALLETS.has(owner)) {
    return {
      isLP: true,
      confidence: 99,
      platform: 'Known LP Wallet',
      reason: 'Hardcoded LP wallet address',
      source: 'known_wallet'
    };
  }
  
  // Priority 4: Burn address (tokens locked forever)
  if (BURN_ADDRESSES.has(owner)) {
    return {
      isLP: true,
      confidence: 100,
      platform: 'Burned',
      reason: 'Tokens sent to burn address',
      source: 'burned'
    };
  }
  
  // Priority 5: DEX program ownership (95% confidence)
  for (const [platform, programId] of Object.entries(KNOWN_DEX_PROGRAMS)) {
    if (accountOwner === programId) {
      return {
        isLP: true,
        confidence: 95,
        platform,
        reason: `Token account owned by ${platform} program`,
        source: 'program_id'
      };
    }
  }
  
  // Priority 6: Bonding curve program ownership (95% confidence)
  for (const [platform, programId] of Object.entries(BONDING_CURVE_PROGRAMS)) {
    if (accountOwner === programId) {
      return {
        isLP: true,
        confidence: 95,
        platform: `${platform} Bonding Curve`,
        reason: `Token account owned by ${platform} bonding curve`,
        source: 'program_id'
      };
    }
  }
  
  // Priority 7: High concentration heuristic (less reliable)
  // Raised threshold to 20% to reduce false positives on large whale holders
  if (percentageOfSupply > 20) {
    return {
      isLP: true,
      confidence: 60,
      platform: 'Unknown Platform',
      reason: `High concentration (${percentageOfSupply.toFixed(1)}%) - likely undetected LP`,
      source: 'heuristic'
    };
  }
  
  // Not detected as LP
  return {
    isLP: false,
    confidence: 0,
    platform: null,
    reason: null,
    source: null
  };
}

// ============================================
// LAUNCHPAD DETECTION
// ============================================

export interface LaunchpadInfo {
  name: string;
  detected: boolean;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect which launchpad a token was created on
 */
export function detectLaunchpad(pairData: any, tokenMint: string): LaunchpadInfo {
  // Priority 1: Check DexScreener pair info websites
  if (pairData?.info?.websites && Array.isArray(pairData.info.websites)) {
    for (const website of pairData.info.websites) {
      const url = website.url || website;
      if (typeof url === 'string') {
        if (url.includes('pump.fun')) {
          return { name: 'pump.fun', detected: true, confidence: 'high' };
        }
        if (url.includes('bonk.bot') || url.includes('bonk.fun') || url.includes('letsbonk.fun')) {
          return { name: 'bonk.fun', detected: true, confidence: 'high' };
        }
        if (url.includes('bags.fm')) {
          return { name: 'bags.fm', detected: true, confidence: 'high' };
        }
        if (url.includes('moonshot')) {
          return { name: 'moonshot', detected: true, confidence: 'high' };
        }
      }
    }
  }
  
  // Priority 2: Check socials/urls array
  if (pairData?.info?.socials && Array.isArray(pairData.info.socials)) {
    for (const social of pairData.info.socials) {
      const url = social.url || '';
      if (url.includes('pump.fun')) {
        return { name: 'pump.fun', detected: true, confidence: 'medium' };
      }
      if (url.includes('letsbonk.fun') || url.includes('bonk.fun')) {
        return { name: 'bonk.fun', detected: true, confidence: 'medium' };
      }
    }
  }
  
  // Priority 3: Check address suffix (less reliable)
  if (tokenMint.endsWith('pump')) {
    return { name: 'pump.fun', detected: true, confidence: 'low' };
  }
  if (tokenMint.endsWith('bonk')) {
    return { name: 'bonk.fun', detected: true, confidence: 'low' };
  }
  if (tokenMint.endsWith('bags')) {
    return { name: 'bags.fm', detected: true, confidence: 'low' };
  }
  
  return { name: 'unknown', detected: false, confidence: 'low' };
}

// ============================================
// HELPER: Get all program IDs as array
// ============================================

export function getAllDEXProgramIds(): string[] {
  return Object.values(KNOWN_DEX_PROGRAMS);
}

export function getAllBondingCurveProgramIds(): string[] {
  return Object.values(BONDING_CURVE_PROGRAMS);
}

export function getAllKnownLPWallets(): string[] {
  return Array.from(KNOWN_LP_WALLETS);
}
