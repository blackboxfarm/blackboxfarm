/**
 * VENUE-AWARE EXECUTABLE QUOTE PROVIDER
 * 
 * Gets executable quotes from the ACTUAL venue that will execute the trade:
 * - pump.fun on-curve: bonding curve math
 * - bags.fm on-curve: Meteora DBC bonding curve math (on-chain)
 * - bonk.fun on-curve: Raydium Launchlab bonding curve math (on-chain)
 * - graduated tokens: Jupiter quote
 * 
 * This prevents the mismatch where we validate against Jupiter but execute via PumpPortal.
 */

export interface VenueQuote {
  venue: 'pumpfun' | 'bags_fm' | 'bonk_fun' | 'jupiter' | 'unknown';
  isOnCurve: boolean;
  executablePriceUsd: number;
  tokensOut: number;
  solSpent: number;
  priceImpactPct: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  simulationUsed?: boolean;
}

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const METEORA_DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const RAYDIUM_LAUNCHLAB_PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Helper to convert buffer to hex string (Deno-compatible)
function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pump.fun ON-CHAIN fallback (Helius RPC)
 *
 * When pump.fun HTTP APIs are down (e.g., 530), DexScreener can falsely make an
 * on-curve token look "graduated".
 *
 * This reads the bonding curve PDA directly and returns the authoritative
 * on-chain curve status + reserves.
 */
async function fetchPumpFunCurveOnChain(
  tokenMint: string,
  heliusApiKey: string
): Promise<{
  complete: boolean;
  virtualSolReserves: number;
  virtualTokenReserves: number;
} | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const mint = new PublicKey(tokenMint);
    const programId = new PublicKey(PUMP_PROGRAM_ID);
    const seed = new TextEncoder().encode('bonding-curve');

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [seed, mint.toBuffer()],
      programId
    );

    const info = await connection.getAccountInfo(bondingCurvePda);
    if (!info?.data || info.data.length < 49) {
      return null;
    }

    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Layout: discriminator(8) + vToken(8) + vSol(8) + ... + complete(1 @ byte 48)
    const virtualTokenReserves = Number(view.getBigUint64(8, true));
    const virtualSolReserves = Number(view.getBigUint64(16, true));
    const complete = data[48] === 1;

    if (
      !Number.isFinite(virtualTokenReserves) ||
      !Number.isFinite(virtualSolReserves) ||
      virtualTokenReserves <= 0 ||
      virtualSolReserves <= 0
    ) {
      return null;
    }

    return { complete, virtualSolReserves, virtualTokenReserves };
  } catch (e) {
    console.log('[fetchPumpFunCurveOnChain] Failed:', e);
    return null;
  }
}

/**
 * Detect which venue will execute a trade for a given token
 * Uses multiple detection methods for reliability
 */
export async function detectVenue(
  tokenMint: string,
  heliusApiKey?: string
): Promise<{ venue: VenueQuote['venue']; isOnCurve: boolean }> {
  
  // ============================================
  // STEP 0: EARLY DETECTION VIA MINT SUFFIX
  // This catches bags.fm/bonk.fun tokens BEFORE other checks fail
  // ============================================
  
  // BAGS suffix = bags.fm token - prioritize bags.fm detection path
  if (tokenMint.endsWith('BAGS')) {
    console.log(`[VenueDetect] BAGS suffix detected, checking bags.fm first`);
    
    // Try bags.fm API directly
    try {
      const bagsRes = await fetch(`https://api.bags.fm/api/v1/token/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });

      if (bagsRes.ok) {
        const bagsData = await bagsRes.json();
        const isGraduated = bagsData.graduated === true || bagsData.migrated === true;
        console.log(`[VenueDetect] bags.fm API: graduated=${isGraduated}`);
        
        if (!isGraduated) {
          // Verify on-chain if we have Helius key
          if (heliusApiKey) {
            const curveCheck = await checkMeteoraDBC(tokenMint, heliusApiKey);
            if (curveCheck?.isOnCurve) {
              console.log(`[VenueDetect] bags.fm on-chain confirmed on-curve`);
              return { venue: 'bags_fm', isOnCurve: true };
            }
          }
          // API says not graduated, trust it
          return { venue: 'bags_fm', isOnCurve: true };
        }
        return { venue: 'bags_fm', isOnCurve: false };
      }
    } catch (e) {
      console.log('[VenueDetect] bags.fm API check failed:', e);
    }
    
    // bags.fm API failed, try on-chain detection
    if (heliusApiKey) {
      const curveCheck = await checkMeteoraDBC(tokenMint, heliusApiKey);
      if (curveCheck) {
        console.log(`[VenueDetect] BAGS token on-chain check: isOnCurve=${curveCheck.isOnCurve}`);
        return { venue: 'bags_fm', isOnCurve: curveCheck.isOnCurve };
      }
    }
    
    // Last resort for BAGS suffix - assume on-curve if we can't verify
    console.log(`[VenueDetect] BAGS suffix but couldn't verify - assuming on-curve`);
    return { venue: 'bags_fm', isOnCurve: true };
  }
  
  // PUMP suffix = pump.fun token - PRIORITIZE THIS CHECK
  if (tokenMint.endsWith('pump')) {
    console.log(`[VenueDetect] pump suffix detected, checking pump.fun directly`);
    
    // First try pump.fun API
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });

      if (pumpRes.ok) {
        const pumpData = await pumpRes.json();
        const isOnCurve = !pumpData.complete && !pumpData.raydium_pool;
        console.log(`[VenueDetect] pump.fun API: complete=${pumpData.complete}, raydium_pool=${!!pumpData.raydium_pool}, isOnCurve=${isOnCurve}`);
        return { venue: 'pumpfun', isOnCurve };
      }
    } catch (e) {
      console.log('[VenueDetect] pump.fun API check failed:', e);
    }
    
    // Fallback to on-chain check
    if (heliusApiKey) {
      const onChainData = await fetchPumpFunCurveOnChain(tokenMint, heliusApiKey);
      if (onChainData) {
        console.log(`[VenueDetect] pump.fun on-chain: complete=${onChainData.complete}`);
        return { venue: 'pumpfun', isOnCurve: !onChainData.complete };
      }
    }
    
    // If we can't verify, assume on-curve for pump suffix tokens
    console.log(`[VenueDetect] pump suffix but couldn't verify - assuming on-curve`);
    return { venue: 'pumpfun', isOnCurve: true };
  }
  
  // BONK suffix = bonk.fun token
  if (tokenMint.endsWith('BONK') || tokenMint.endsWith('bonk')) {
    console.log(`[VenueDetect] BONK suffix detected, checking bonk.fun first`);
    
    try {
      const bonkRes = await fetch(`https://api.bonk.fun/token/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });

      if (bonkRes.ok) {
        const bonkData = await bonkRes.json();
        const isGraduated = bonkData.graduated === true || bonkData.migrated === true;
        
        if (!isGraduated && heliusApiKey) {
          const curveCheck = await checkRaydiumLaunchlab(tokenMint, heliusApiKey);
          if (curveCheck?.isOnCurve) {
            return { venue: 'bonk_fun', isOnCurve: true };
          }
        }
        return { venue: 'bonk_fun', isOnCurve: !isGraduated };
      }
    } catch (e) {
      console.log('[VenueDetect] bonk.fun API check failed:', e);
    }
    
    if (heliusApiKey) {
      const curveCheck = await checkRaydiumLaunchlab(tokenMint, heliusApiKey);
      if (curveCheck) {
        return { venue: 'bonk_fun', isOnCurve: curveCheck.isOnCurve };
      }
    }
    
    return { venue: 'bonk_fun', isOnCurve: true };
  }

  // ============================================
  // STEP 1: Check pump.fun via HTTP API (fastest for pump.fun tokens)
  // ============================================
  try {
    const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (pumpRes.ok) {
      const data = await pumpRes.json();
      if (data && !data.complete) {
        return { venue: 'pumpfun', isOnCurve: true };
      }
      if (data && data.complete) {
        // Graduated pump.fun token - goes to Jupiter/Raydium
        return { venue: 'jupiter', isOnCurve: false };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] pump.fun API check failed:', e);
  }

  // 1b. Pump.fun ON-CHAIN fallback (authoritative)
  // IMPORTANT: must happen BEFORE DexScreener fallback; DexScreener can show pairs
  // for tokens that are still on-curve.
  if (heliusApiKey) {
    const curve = await fetchPumpFunCurveOnChain(tokenMint, heliusApiKey);
    if (curve) {
      if (curve.complete) {
        return { venue: 'jupiter', isOnCurve: false };
      }
      return { venue: 'pumpfun', isOnCurve: true };
    }
  }

  // ============================================
  // STEP 2: Check bags.fm API (for tokens without BAGS suffix)
  // ============================================
  try {
    const bagsRes = await fetch(`https://api.bags.fm/api/v1/token/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (bagsRes.ok) {
      const bagsData = await bagsRes.json();
      // If bags.fm returns token data, it's a bags.fm token
      if (bagsData && (bagsData.mint || bagsData.address)) {
        // Check if graduated
        const isGraduated = bagsData.graduated === true || bagsData.migrated === true;
        if (!isGraduated && heliusApiKey) {
          const curveCheck = await checkMeteoraDBC(tokenMint, heliusApiKey);
          if (curveCheck?.isOnCurve) {
            return { venue: 'bags_fm', isOnCurve: true };
          }
        }
        return { venue: 'bags_fm', isOnCurve: !isGraduated };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] bags.fm API check failed:', e);
  }

  // ============================================
  // STEP 3: Check bonk.fun API
  // ============================================
  try {
    const bonkRes = await fetch(`https://api.bonk.fun/token/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (bonkRes.ok) {
      const bonkData = await bonkRes.json();
      if (bonkData && (bonkData.mint || bonkData.address)) {
        const isGraduated = bonkData.graduated === true || bonkData.migrated === true;
        if (!isGraduated && heliusApiKey) {
          const curveCheck = await checkRaydiumLaunchlab(tokenMint, heliusApiKey);
          if (curveCheck?.isOnCurve) {
            return { venue: 'bonk_fun', isOnCurve: true };
          }
        }
        return { venue: 'bonk_fun', isOnCurve: !isGraduated };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] bonk.fun API check failed:', e);
  }

  // ============================================
  // STEP 4: On-chain PDA checks (before DexScreener)
  // ============================================
  if (heliusApiKey) {
    // Check for Meteora DBC pool
    const meteoraCheck = await checkMeteoraDBC(tokenMint, heliusApiKey);
    if (meteoraCheck?.isOnCurve) {
      console.log(`[VenueDetect] Found Meteora DBC pool on-chain`);
      return { venue: 'bags_fm', isOnCurve: true };
    }

    // Check for Raydium Launchlab pool
    const launchlabCheck = await checkRaydiumLaunchlab(tokenMint, heliusApiKey);
    if (launchlabCheck?.isOnCurve) {
      console.log(`[VenueDetect] Found Raydium Launchlab pool on-chain`);
      return { venue: 'bonk_fun', isOnCurve: true };
    }
  }

  // ============================================
  // STEP 5: Check DexScreener for venue hints (graduated tokens)
  // ============================================
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      signal: AbortSignal.timeout(3000)
    });

    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pairs = dexData?.pairs || [];

      for (const pair of pairs) {
        const dexId = (pair.dexId || '').toLowerCase();
        const pairUrl = (pair.url || '').toLowerCase();

        // bags.fm uses Meteora DBC
        if (dexId.includes('meteora') && pairUrl.includes('bags')) {
          return { venue: 'bags_fm', isOnCurve: false };
        }

        // bonk.fun uses Raydium Launchlab
        if (dexId.includes('raydium') && pairUrl.includes('bonk')) {
          return { venue: 'bonk_fun', isOnCurve: false };
        }
      }

      // Has DexScreener pairs but not a special venue - it's graduated
      if (pairs.length > 0) {
        return { venue: 'jupiter', isOnCurve: false };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] DexScreener check failed:', e);
  }

  // Default to unknown - will use Jupiter
  return { venue: 'unknown', isOnCurve: false };
}

/**
 * Check for Meteora DBC on-curve status via pool discovery
 * FIXED: Use program account scan instead of incorrect PDA derivation
 */
async function checkMeteoraDBC(tokenMint: string, heliusApiKey: string): Promise<{ isOnCurve: boolean; poolData?: any } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(METEORA_DBC_PROGRAM_ID);
    const tokenMintPubkey = new PublicKey(tokenMint);
    const tokenMintBuffer = tokenMintPubkey.toBuffer();
    const tokenMintHex = toHex(new Uint8Array(tokenMintBuffer));
    
    console.log(`[checkMeteoraDBC] Searching for pool containing mint ${tokenMint.slice(0, 8)}...`);

    // Try multiple pool account sizes since Meteora uses variable layouts
    const accountSizes = [360, 400, 432, 500, 550];
    
    for (const dataSize of accountSizes) {
      try {
        const accounts = await connection.getProgramAccounts(programId, {
          filters: [{ dataSize }],
          commitment: 'confirmed',
        });

        console.log(`[checkMeteoraDBC] Found ${accounts.length} accounts with dataSize=${dataSize}`);

        // Search each account for our token mint
        for (const { pubkey, account } of accounts) {
          const data = account.data;
          if (data.length < 80) continue;

          // Convert account data to hex for searching
          const dataHex = toHex(data);
          
          if (!dataHex.includes(tokenMintHex)) continue;

          console.log(`[checkMeteoraDBC] Found matching pool: ${pubkey.toBase58()}`);

          // Parse the pool data to check if still on curve
          const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
          
          // Try multiple offsets for quote reserve
          let quoteReserve = 0n;
          const offsets = [72, 80, 88, 96];
          for (const offset of offsets) {
            if (data.length >= offset + 8) {
              try {
                const val = view.getBigUint64(offset, true);
                if (val > 0n && val < 1000_000_000_000n) { // < 1000 SOL in lamports
                  quoteReserve = val;
                  console.log(`[checkMeteoraDBC] Found quoteReserve at offset ${offset}: ${Number(val) / 1e9} SOL`);
                  break;
                }
              } catch {}
            }
          }

          // If we found a pool, it's likely still on curve unless reserves are depleted
          const migrationThreshold = 85_000_000_000n; // 85 SOL
          const isOnCurve = quoteReserve > 0n && quoteReserve < migrationThreshold;
          
          return {
            isOnCurve,
            poolData: {
              poolPda: pubkey.toBase58(),
              quoteReserve: Number(quoteReserve),
              dataSize
            }
          };
        }
      } catch (e) {
        console.log(`[checkMeteoraDBC] Error with dataSize=${dataSize}:`, e);
        continue;
      }
    }

    // No pool found with any size filter - try without dataSize filter as last resort
    try {
      console.log(`[checkMeteoraDBC] Trying without dataSize filter...`);
      const accounts = await connection.getProgramAccounts(programId, {
        commitment: 'confirmed',
      });

      console.log(`[checkMeteoraDBC] Found ${accounts.length} total accounts`);

      for (const { pubkey, account } of accounts.slice(0, 100)) { // Limit to first 100
        const data = account.data;
        if (data.length < 80) continue;

        const dataHex = toHex(data);
        if (!dataHex.includes(tokenMintHex)) continue;

        console.log(`[checkMeteoraDBC] Found matching pool (no filter): ${pubkey.toBase58()}, size=${data.length}`);
        
        return {
          isOnCurve: true, // Found pool = on curve
          poolData: {
            poolPda: pubkey.toBase58(),
            dataSize: data.length
          }
        };
      }
    } catch (e) {
      console.log(`[checkMeteoraDBC] No-filter search failed:`, e);
    }

    console.log(`[checkMeteoraDBC] No pool found for ${tokenMint.slice(0, 8)}`);
    return null;
  } catch (e) {
    console.log('[checkMeteoraDBC] Failed:', e);
    return null;
  }
}

/**
 * Check for Raydium Launchlab on-curve status
 */
async function checkRaydiumLaunchlab(tokenMint: string, heliusApiKey: string): Promise<{ isOnCurve: boolean; poolData?: any } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);
    const mint = new PublicKey(tokenMint);
    
    // Derive pool PDA: ["pool", mint]
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), mint.toBuffer()],
      programId
    );

    // Check if pool vault has tokens
    const tokenAccounts = await connection.getTokenAccountsByOwner(poolPda, { mint });
    
    if (tokenAccounts.value.length > 0) {
      // Has tokens in vault = still on curve
      const tokenBalance = tokenAccounts.value[0]?.account.lamports || 0;
      return { 
        isOnCurve: true,
        poolData: {
          poolPda: poolPda.toBase58(),
          hasTokens: true
        }
      };
    }
    
    return { isOnCurve: false };
  } catch (e) {
    console.log('[checkRaydiumLaunchlab] Failed:', e);
    return null;
  }
}

// Import the shared SOL price fetcher with logging
import { getSolPrice as getSharedSolPrice, getSolPriceWithLogging } from "./sol-price-fetcher.ts";

/**
 * Get SOL price for USD conversions - uses shared fetcher with logging
 */
async function getSolPrice(): Promise<number> {
  return await getSharedSolPrice();
}

/**
 * Compute quote from Meteora DBC bonding curve (bags.fm) using on-chain math
 */
async function computeMeteoraDBC_Quote(
  tokenMint: string,
  solAmountLamports: number,
  heliusApiKey: string
): Promise<{ tokensOut: number; priceImpactPct: number; source: string } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(METEORA_DBC_PROGRAM_ID);
    const mint = new PublicKey(tokenMint);
    
    // Derive pool PDA
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), mint.toBuffer()],
      programId
    );

    const accountInfo = await connection.getAccountInfo(poolPda);
    
    if (!accountInfo || accountInfo.data.length < 120) {
      console.log('[MeteoraDBC Quote] Pool account not found or too small');
      return null;
    }
    
    const data = accountInfo.data;
    
    // Parse Meteora DBC pool data layout:
    // These offsets are approximate - Meteora DBC uses a specific layout
    // u64 values stored as little-endian
    const baseReserve = Number(data.readBigUInt64LE(72));
    const quoteReserve = Number(data.readBigUInt64LE(80));
    
    // Virtual reserves may be separate or included
    // Using base/quote reserve directly for constant product formula
    
    if (baseReserve <= 0 || quoteReserve <= 0) {
      console.log('[MeteoraDBC Quote] Invalid reserves:', { baseReserve, quoteReserve });
      return null;
    }
    
    // Constant product AMM: k = base * quote
    // After swap: (base - tokensOut) * (quote + solIn) = k
    // tokensOut = base - k / (quote + solIn)
    const k = baseReserve * quoteReserve;
    const newQuoteReserve = quoteReserve + solAmountLamports;
    const newBaseReserve = k / newQuoteReserve;
    const tokensOutRaw = baseReserve - newBaseReserve;
    
    // Apply fee (typically 1% on bonding curves)
    const FEE_BPS = 100; // 1%
    const tokensOutAfterFee = tokensOutRaw * (1 - FEE_BPS / 10000);
    
    // Convert to human-readable (assuming 6 decimals)
    const tokensOut = tokensOutAfterFee / 1e6;
    
    // Price impact
    const priceImpactPct = (solAmountLamports / quoteReserve) * 100;
    
    console.log(`[MeteoraDBC Quote] ${tokensOut.toFixed(4)} tokens for ${solAmountLamports / 1e9} SOL, impact: ${priceImpactPct.toFixed(2)}%`);
    
    return {
      tokensOut,
      priceImpactPct,
      source: 'meteora_dbc_onchain'
    };
  } catch (e) {
    console.error('[MeteoraDBC Quote] Error:', e);
    return null;
  }
}

/**
 * Compute quote from Raydium Launchlab bonding curve (bonk.fun) using on-chain math
 */
async function computeRaydiumLaunchlab_Quote(
  tokenMint: string,
  solAmountLamports: number,
  heliusApiKey: string
): Promise<{ tokensOut: number; priceImpactPct: number; source: string } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);
    const mint = new PublicKey(tokenMint);
    
    // Derive pool PDA
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), mint.toBuffer()],
      programId
    );

    const accountInfo = await connection.getAccountInfo(poolPda);
    
    if (!accountInfo || accountInfo.data.length < 150) {
      console.log('[Launchlab Quote] Pool account not found or too small');
      return null;
    }
    
    const data = accountInfo.data;
    
    // Raydium Launchlab pool data layout (approximate):
    // These positions need validation against actual pool data
    const tokenReserve = Number(data.readBigUInt64LE(72));
    const solReserve = Number(data.readBigUInt64LE(80));
    
    // Virtual reserves
    const virtualTokenReserve = Number(data.readBigUInt64LE(88));
    const virtualSolReserve = Number(data.readBigUInt64LE(96));
    
    // Use virtual reserves if available, otherwise use actual
    const effectiveTokenReserve = virtualTokenReserve > 0 ? virtualTokenReserve : tokenReserve;
    const effectiveSolReserve = virtualSolReserve > 0 ? virtualSolReserve : solReserve;
    
    if (effectiveTokenReserve <= 0 || effectiveSolReserve <= 0) {
      console.log('[Launchlab Quote] Invalid reserves');
      return null;
    }
    
    // Constant product AMM math
    const k = effectiveTokenReserve * effectiveSolReserve;
    const newSolReserve = effectiveSolReserve + solAmountLamports;
    const newTokenReserve = k / newSolReserve;
    const tokensOutRaw = effectiveTokenReserve - newTokenReserve;
    
    // Apply fee (typically 1%)
    const FEE_BPS = 100;
    const tokensOutAfterFee = tokensOutRaw * (1 - FEE_BPS / 10000);
    const tokensOut = tokensOutAfterFee / 1e6;
    
    const priceImpactPct = (solAmountLamports / effectiveSolReserve) * 100;
    
    console.log(`[Launchlab Quote] ${tokensOut.toFixed(4)} tokens for ${solAmountLamports / 1e9} SOL, impact: ${priceImpactPct.toFixed(2)}%`);
    
    return {
      tokensOut,
      priceImpactPct,
      source: 'raydium_launchlab_onchain'
    };
  } catch (e) {
    console.error('[Launchlab Quote] Error:', e);
    return null;
  }
}

/**
 * Get DexScreener quote as fallback
 */
async function getDexScreenerQuote(
  tokenMint: string,
  solSpent: number,
  solPrice: number
): Promise<{ priceUsd: number; estimatedTokens: number; liquidity: number } | null> {
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (!dexRes.ok) return null;
    
    const dexData = await dexRes.json();
    // Sort by liquidity (USD) descending
    const pairs = (dexData?.pairs || []).sort((a: any, b: any) => 
      (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0)
    );
    
    const pair = pairs[0];
    if (!pair?.priceUsd) return null;
    
    const priceUsd = Number(pair.priceUsd);
    const usdSpent = solSpent * solPrice;
    const estimatedTokens = usdSpent / priceUsd;
    const liquidity = Number(pair.liquidity?.usd) || 0;
    
    return { priceUsd, estimatedTokens, liquidity };
  } catch (e) {
    console.log('[DexScreener Quote] Failed:', e);
    return null;
  }
}

/**
 * Get venue-aware executable quote
 * 
 * Uses the SAME venue that will actually execute the trade:
 * - pump.fun: pump.fun API + bonding curve math
 * - bags.fm: Meteora DBC on-chain bonding curve math
 * - bonk.fun: Raydium Launchlab on-chain bonding curve math
 * - graduated tokens: Jupiter quote
 */
export async function getVenueAwareQuote(
  tokenMint: string,
  solAmountLamports: number,
  walletPubkey: string,
  options: {
    heliusApiKey?: string;
    slippageBps?: number;
  } = {}
): Promise<VenueQuote | null> {
  const { heliusApiKey, slippageBps = 500 } = options;
  
  // Detect venue first
  const { venue, isOnCurve } = await detectVenue(tokenMint, heliusApiKey);
  
  console.log(`[VenueQuote] Token ${tokenMint.slice(0, 8)}... detected as: ${venue}, onCurve=${isOnCurve}`);
  
  const solPrice = await getSolPrice();
  const solSpent = solAmountLamports / 1e9;
  const usdSpent = solSpent * solPrice;
  
  // ============================================
  // PUMP.FUN ON-CURVE: Use pump.fun API + bonding curve math
  // ============================================
  if (venue === 'pumpfun' && isOnCurve) {
    // 1) Try pump.fun HTTP API reserves (fast)
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (pumpRes.ok) {
        const data = await pumpRes.json();
        const virtualSolReserves = Number(data.virtual_sol_reserves);
        const virtualTokenReserves = Number(data.virtual_token_reserves);

        if (virtualSolReserves && virtualTokenReserves) {
          // Constant product AMM math
          const newSolReserves = virtualSolReserves + solAmountLamports;
          const newTokenReserves = (virtualSolReserves * virtualTokenReserves) / newSolReserves;
          const tokensOutRaw = virtualTokenReserves - newTokenReserves;
          const tokensOut = tokensOutRaw / 1e6; // 6 decimals

          const executablePriceUsd = tokensOut > 0 ? usdSpent / tokensOut : 0;
          const priceImpactPct = (solAmountLamports / virtualSolReserves) * 100;

          return {
            venue: 'pumpfun',
            isOnCurve: true,
            executablePriceUsd,
            tokensOut,
            solSpent,
            priceImpactPct,
            confidence: 'high',
            source: 'pumpfun_curve_math'
          };
        }
      }
    } catch (e) {
      console.log('[VenueQuote] pump.fun curve quote failed:', e);
    }

    // 2) Fallback: on-chain curve reserves via Helius (authoritative)
    if (heliusApiKey) {
      const curve = await fetchPumpFunCurveOnChain(tokenMint, heliusApiKey);
      if (curve && !curve.complete) {
        const vSol = BigInt(Math.floor(curve.virtualSolReserves));
        const vTok = BigInt(Math.floor(curve.virtualTokenReserves));
        const solIn = BigInt(solAmountLamports);

        const newVSol = vSol + solIn;
        const newVTok = (vSol * vTok) / newVSol;
        const tokensOutRaw = vTok - newVTok;
        const tokensOut = Number(tokensOutRaw) / 1e6;

        const executablePriceUsd = tokensOut > 0 ? usdSpent / tokensOut : 0;
        const priceImpactPct = vSol > 0n ? (Number(solIn) / Number(vSol)) * 100 : 0;

        return {
          venue: 'pumpfun',
          isOnCurve: true,
          executablePriceUsd,
          tokensOut,
          solSpent,
          priceImpactPct,
          confidence: 'high',
          source: 'pumpfun_curve_onchain'
        };
      }
    }
  }
  
  // ============================================
  // BAGS.FM ON-CURVE: Use Meteora DBC on-chain bonding curve math
  // ============================================
  if (venue === 'bags_fm' && isOnCurve && heliusApiKey) {
    const meteoraQuote = await computeMeteoraDBC_Quote(tokenMint, solAmountLamports, heliusApiKey);
    
    if (meteoraQuote && meteoraQuote.tokensOut > 0) {
      const executablePriceUsd = usdSpent / meteoraQuote.tokensOut;
      
      return {
        venue: 'bags_fm',
        isOnCurve: true,
        executablePriceUsd,
        tokensOut: meteoraQuote.tokensOut,
        solSpent,
        priceImpactPct: meteoraQuote.priceImpactPct,
        confidence: 'high',
        source: meteoraQuote.source
      };
    }
    
    // Fallback to DexScreener if on-chain fails
    const dexQuote = await getDexScreenerQuote(tokenMint, solSpent, solPrice);
    if (dexQuote) {
      return {
        venue: 'bags_fm',
        isOnCurve: true,
        executablePriceUsd: dexQuote.priceUsd,
        tokensOut: dexQuote.estimatedTokens,
        solSpent,
        priceImpactPct: 5, // Estimate
        confidence: 'low',
        source: 'dexscreener_fallback'
      };
    }
  }
  
  // ============================================
  // BONK.FUN ON-CURVE: Use Raydium Launchlab on-chain bonding curve math
  // ============================================
  if (venue === 'bonk_fun' && isOnCurve && heliusApiKey) {
    const launchlabQuote = await computeRaydiumLaunchlab_Quote(tokenMint, solAmountLamports, heliusApiKey);
    
    if (launchlabQuote && launchlabQuote.tokensOut > 0) {
      const executablePriceUsd = usdSpent / launchlabQuote.tokensOut;
      
      return {
        venue: 'bonk_fun',
        isOnCurve: true,
        executablePriceUsd,
        tokensOut: launchlabQuote.tokensOut,
        solSpent,
        priceImpactPct: launchlabQuote.priceImpactPct,
        confidence: 'high',
        source: launchlabQuote.source
      };
    }
    
    // Fallback to DexScreener
    const dexQuote = await getDexScreenerQuote(tokenMint, solSpent, solPrice);
    if (dexQuote) {
      return {
        venue: 'bonk_fun',
        isOnCurve: true,
        executablePriceUsd: dexQuote.priceUsd,
        tokensOut: dexQuote.estimatedTokens,
        solSpent,
        priceImpactPct: 5,
        confidence: 'low',
        source: 'dexscreener_fallback'
      };
    }
  }
  
  // ============================================
  // GRADUATED TOKENS: Use Jupiter quote
  // ============================================
  try {
    const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${solAmountLamports}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    
    const res = await fetch(quoteUrl, {
      headers: { 
        "Accept": "application/json",
        ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (res.ok) {
      const quote = await res.json();
      
      if (quote?.outAmount) {
        const outputDecimals = quote.outputMint?.decimals || 6;
        const tokensOut = Number(quote.outAmount) / Math.pow(10, outputDecimals);
        const priceImpactPct = Number(quote.priceImpactPct || 0);
        const executablePriceUsd = tokensOut > 0 ? usdSpent / tokensOut : 0;
        
        return {
          venue: 'jupiter',
          isOnCurve: false,
          executablePriceUsd,
          tokensOut,
          solSpent,
          priceImpactPct,
          confidence: 'high',
          source: 'jupiter_quote'
        };
      }
    }
  } catch (e) {
    console.log('[VenueQuote] Jupiter quote failed:', e);
  }
  
  // ============================================
  // FINAL FALLBACK: DexScreener estimate
  // ============================================
  const dexQuote = await getDexScreenerQuote(tokenMint, solSpent, solPrice);
  if (dexQuote) {
    return {
      venue: venue === 'unknown' ? 'jupiter' : venue,
      isOnCurve: false,
      executablePriceUsd: dexQuote.priceUsd,
      tokensOut: dexQuote.estimatedTokens,
      solSpent,
      priceImpactPct: 5,
      confidence: 'low',
      source: 'dexscreener_final_fallback'
    };
  }
  
  return null;
}
