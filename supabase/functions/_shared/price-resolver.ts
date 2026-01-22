/**
 * PRICE RESOLVER - Token State Router
 * 
 * API Truth Table Implementation:
 * - Pre-Raydium (on bonding curve): pump.fun API -> bonding curve math
 * - Post-Raydium (graduated): DexScreener -> Jupiter fallback
 * 
 * This is the SINGLE SOURCE OF TRUTH for all price fetching across FlipIt.
 */

import { getSolPriceWithLogging } from './sol-price-fetcher.ts';

// ============================================
// TYPES
// ============================================

export type PriceSource = 
  | 'pumpfun_api'      // Fresh from pump.fun HTTP API
  | 'pumpfun_curve'    // Computed from on-chain bonding curve
  | 'meteora_dbc'      // bags.fm Meteora Dynamic Bonding Curve
  | 'raydium_launchlab' // Bonk.fun Raydium Launchlab curve
  | 'dexscreener'      // DexScreener (best for graduated tokens)
  | 'jupiter'          // Jupiter (fallback)
  | 'fallback';        // Last resort / cached

export interface PriceResult {
  price: number;
  source: PriceSource;
  fetchedAt: string;
  latencyMs: number;
  isOnCurve: boolean;
  bondingCurveProgress?: number;  // 0-100, only for curve tokens
  confidence: 'high' | 'medium' | 'low';
  virtualSolReserves?: number;
  virtualTokenReserves?: number;
  pairAddress?: string;  // DexScreener pair address for pool lookups
}

export interface CurveState {
  isOnCurve: boolean;
  complete: boolean;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  progress: number;  // 0-100
}

export interface BulkPriceResult {
  prices: Record<string, number>;
  metadata: Record<string, PriceResult>;
}

// ============================================
// CONSTANTS
// ============================================

// pump.fun
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;

// bags.fm (Meteora Dynamic Bonding Curve)
const METEORA_DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const METEORA_BASE_MINT = 'So11111111111111111111111111111111111111112'; // WSOL

// Bonk.fun (Raydium Launchlab)
const RAYDIUM_LAUNCHLAB_PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const LAUNCHLAB_INITIAL_TOKEN_BALANCE = 793_100_000_000_000n; // ~793.1M tokens (6 decimals)
const LAUNCHLAB_DEAD_BALANCE = 206_900_000_000_000n; // ~206.9M tokens remain at graduation

// Cache with 1-second TTL (reduced from 3s to minimize stale price issues)
const priceCache: Map<string, { result: PriceResult; timestamp: number }> = new Map();
const CACHE_TTL_MS = 1000;

// SOL price cache (slightly longer TTL since SOL moves slower)
let solPriceCache: { price: number; timestamp: number } | null = null;
const SOL_CACHE_TTL_MS = 10000;

// ============================================
// SOL PRICE
// ============================================

export async function fetchSolPrice(): Promise<number> {
  // Check cache - return immediately without logging
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_CACHE_TTL_MS) {
    return solPriceCache.price;
  }

  // Use the shared SOL price fetcher with logging (only on cache miss)
  try {
    const { price } = await getSolPriceWithLogging('price-resolver');
    solPriceCache = { price, timestamp: Date.now() };
    return price;
  } catch (e) {
    // CRITICAL: If we can't get SOL price, use cache if available, otherwise FAIL
    // Never use a hardcoded fallback - that causes mismatched calculations
    if (solPriceCache?.price) {
      console.warn('[fetchSolPrice] Using stale cached SOL price:', solPriceCache.price);
      return solPriceCache.price;
    }

    console.error('[fetchSolPrice] CRITICAL: Could not fetch SOL price from any source');
    throw e;
  }
}

// ============================================
// BONDING CURVE STATE (On-Chain via Helius RPC)
// ============================================

export async function fetchBondingCurveState(
  tokenMint: string,
  heliusApiKey: string
): Promise<CurveState | null> {
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
      return null; // Not a pump.fun token or graduated
    }

    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Parse bonding curve account data
    // Layout: discriminator (8) + virtualTokenReserves (8) + virtualSolReserves (8) + realTokenReserves (8) + realSolReserves (8) + tokenTotalSupply (8) + complete (1)
    const virtualTokenReserves = view.getBigUint64(8, true);
    const virtualSolReserves = view.getBigUint64(16, true);
    const realTokenReserves = view.getBigUint64(24, true);
    const realSolReserves = view.getBigUint64(32, true);
    const complete = data[48] === 1;

    // Calculate progress: tokens sold / initial tokens
    const tokensSold = INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
    const progress = Math.min(Math.max(Number(tokensSold * 100n / INITIAL_REAL_TOKEN_RESERVES), 0), 100);

    return {
      isOnCurve: !complete,
      complete,
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      progress
    };
  } catch (e) {
    console.log('Bonding curve fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// BONDING CURVE PRICE COMPUTATION
// ============================================

export function computeBondingCurvePrice(curveState: CurveState, solPriceUsd: number): number {
  // Price in SOL = virtualSolReserves / virtualTokenReserves
  // Note: SOL has 9 decimals, pump.fun tokens have 6 decimals
  const priceInSol = (Number(curveState.virtualSolReserves) / 1e9) / 
                     (Number(curveState.virtualTokenReserves) / 1e6);
  
  return priceInSol * solPriceUsd;
}

// ============================================
// METEORA DBC STATE (bags.fm) - On-Chain via Helius RPC
// ============================================

export interface MeteoraCurveState {
  isOnCurve: boolean;
  progress: number;  // 0-100
  quoteReserve: bigint;
  migrationThreshold: bigint;
  currentPrice?: number;  // Price in SOL (if calculable)
}

/**
 * Fetch bonding curve state for bags.fm tokens (Meteora Dynamic Bonding Curve)
 * 
 * Pool PDA derivation: seeds = ['pool', base_mint, quote_mint, config]
 * Account layout (partial):
 *   - Byte 72-80: quote_reserve (u64) - SOL deposited
 *   - Config has migration_quote_threshold 
 */
/**
 * Fetch bonding curve state for bags.fm tokens (Meteora Dynamic Bonding Curve)
 * 
 * CRITICAL FIX: Use Deno-compatible hex encoding and scan multiple account sizes
 */
export async function fetchMeteoraDBC(
  tokenMint: string,
  heliusApiKey: string
): Promise<MeteoraCurveState | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(METEORA_DBC_PROGRAM_ID);

    // Helper function to convert Uint8Array to hex (Deno-compatible)
    const toHex = (bytes: Uint8Array): string => {
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // Get token mint as hex for matching
    const tokenMintBuffer = new PublicKey(tokenMint).toBuffer();
    const tokenMintHex = toHex(new Uint8Array(tokenMintBuffer));
    
    console.log(`[Meteora DBC] Searching for pool containing ${tokenMint.slice(0, 8)}...`);

    // Try multiple pool account sizes (Meteora uses variable layouts)
    const accountSizes = [360, 400, 432, 500, 550];
    
    for (const dataSize of accountSizes) {
      try {
        const accounts = await connection.getProgramAccounts(programId, {
          filters: [{ dataSize }],
          commitment: 'confirmed',
        });

        console.log(`[Meteora DBC] Found ${accounts.length} accounts with dataSize=${dataSize}`);

        // Find a pool that contains our token
        for (const { pubkey, account } of accounts) {
          const data = account.data;
          if (data.length < 80) continue;

          try {
            // Convert account data to hex for searching
            const dataHex = toHex(data);
            
            if (!dataHex.includes(tokenMintHex)) continue;

            console.log(`[Meteora DBC] Found matching pool: ${pubkey.toBase58()}`);

            // Found a matching pool - parse the relevant data
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            
            // Try multiple offsets for quote reserve
            let quoteReserve = 0n;
            const offsets = [72, 80, 88, 96];
            for (const offset of offsets) {
              if (data.length >= offset + 8) {
                try {
                  const val = view.getBigUint64(offset, true);
                  // Reasonable SOL reserve range: > 0 and < 1000 SOL
                  if (val > 0n && val < 1000_000_000_000n) {
                    quoteReserve = val;
                    console.log(`[Meteora DBC] Found quoteReserve at offset ${offset}: ${Number(val) / 1e9} SOL`);
                    break;
                  }
                } catch {}
              }
            }

            // Migration threshold is 60 SOL for bags.fm (per padre.gg)
            const migrationThreshold = 60_000_000_000n; // 60 SOL in lamports
            
            // Calculate progress
            const progress = Math.min(
              Math.max(Number((quoteReserve * 100n) / migrationThreshold), 0),
              100
            );

            const isOnCurve = progress < 100 && quoteReserve > 0n;

            console.log(`[Meteora DBC] ${tokenMint.slice(0, 8)}: quoteReserve=${Number(quoteReserve) / 1e9} SOL, progress=${progress.toFixed(1)}%, onCurve=${isOnCurve}`);

            return {
              isOnCurve,
              progress,
              quoteReserve,
              migrationThreshold,
            };
          } catch (parseError) {
            console.log('[Meteora DBC] Parse error for pool, continuing:', parseError);
            continue;
          }
        }
      } catch (e) {
        console.log(`[Meteora DBC] Error with dataSize=${dataSize}:`, e);
        continue;
      }
    }

    // REMOVED: No-filter fallback causes memory crashes on getProgramAccounts
    // If we couldn't find the pool with size filters, it's likely not a Meteora DBC pool

    console.log(`[Meteora DBC] No pool found for ${tokenMint.slice(0, 8)}`);
    return null;
  } catch (e) {
    console.log('[Meteora DBC] Fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// METEORA DBC PROGRESS - Direct On-Chain Parsing
// ============================================

/**
 * Fetch bonding curve progress from Meteora DBC pool
 * 
 * bags.fm uses 60 SOL migration threshold based on padre.gg observations.
 * This parses the pool account directly to extract quoteReserve.
 */
async function fetchMeteoraCurveProgressFromPool(
  poolAddress: string,
  heliusApiKey: string
): Promise<{ progress: number; quoteReserve: number; threshold: number } | undefined> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const poolPubkey = new PublicKey(poolAddress);
    const accountInfo = await connection.getAccountInfo(poolPubkey);
    
    if (!accountInfo?.data) {
      console.log(`[MeteoraCurve] No account data for pool ${poolAddress.slice(0, 8)}`);
      return undefined;
    }

    const data = accountInfo.data;
    const ownerProgram = accountInfo.owner.toBase58();
    console.log(`[MeteoraCurve] Pool account size: ${data.length} bytes, owner: ${ownerProgram.slice(0, 8)}...`);
    
    // Check if this is a Meteora DBC pool
    if (!ownerProgram.startsWith('dbcij3LW')) {
      console.log(`[MeteoraCurve] Pool is NOT Meteora DBC, skipping`);
      return undefined;
    }
    
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    // bags.fm migration threshold is 60 SOL (confirmed via padre.gg)
    const MIGRATION_THRESHOLD_SOL = 60;
    const migrationThreshold = BigInt(MIGRATION_THRESHOLD_SOL * 1_000_000_000);
    
    // Scan for quoteReserve (SOL amount in pool)
    // Known offsets for different pool layouts: 240, 256, 296, 320, 336
    const candidates: { offset: number; value: bigint; sol: number }[] = [];
    const knownOffsets = [240, 256, 296, 320, 336];
    
    for (const offset of knownOffsets) {
      if (data.length >= offset + 8) {
        try {
          const val = view.getBigUint64(offset, true);
          const sol = Number(val) / 1e9;
          // Valid range: 0.1 SOL to 100 SOL
          if (sol >= 0.1 && sol <= 100) {
            candidates.push({ offset, value: val, sol });
          }
        } catch {}
      }
    }
    
    if (candidates.length === 0) {
      console.log(`[MeteoraCurve] No SOL reserve candidates found`);
      return undefined;
    }
    
    // Log all candidates for debugging
    const candidateStr = candidates.map(c => `offset ${c.offset}: ${c.sol.toFixed(2)} SOL`).join(', ');
    console.log(`[MeteoraCurve] Found ${candidates.length} potential SOL reserve candidates: ${candidateStr}`);
    
    // Log by offset for debugging
    const offsetMap = candidates.map(c => `[${c.offset}]=${c.sol.toFixed(2)}`).join(', ');
    console.log(`[MeteoraCurve] Candidates by offset: ${offsetMap}`);
    
    // Select the candidate closest to but not exceeding the threshold
    // If multiple valid, prefer offset 240 (most common for quoteReserve)
    let quoteReserve: bigint;
    const offset240Candidate = candidates.find(c => c.offset === 240);
    
    if (offset240Candidate && offset240Candidate.sol <= MIGRATION_THRESHOLD_SOL) {
      quoteReserve = offset240Candidate.value;
      console.log(`[MeteoraCurve] Using quoteReserve at offset 240: ${offset240Candidate.sol.toFixed(4)} SOL`);
    } else {
      // Fall back to largest value under threshold
      const validCandidates = candidates.filter(c => c.sol <= MIGRATION_THRESHOLD_SOL);
      if (validCandidates.length === 0) {
        // All candidates exceed threshold - pool may be graduated or data is wrong
        const largest = candidates.reduce((a, b) => a.value > b.value ? a : b);
        if (largest.sol >= MIGRATION_THRESHOLD_SOL) {
          // Graduated - return 100%
          console.log(`[MeteoraCurve] Pool appears graduated (${largest.sol.toFixed(2)} SOL >= ${MIGRATION_THRESHOLD_SOL} SOL threshold)`);
          return {
            progress: 100,
            quoteReserve: largest.sol,
            threshold: MIGRATION_THRESHOLD_SOL
          };
        }
      }
      const largest = validCandidates.reduce((a, b) => a.value > b.value ? a : b, validCandidates[0]);
      quoteReserve = largest.value;
      console.log(`[MeteoraCurve] Using quoteReserve at offset ${largest.offset}: ${largest.sol.toFixed(4)} SOL`);
    }
    
    // Calculate progress
    const progress = Math.min(
      Math.max(Number((quoteReserve * 100n) / migrationThreshold), 0),
      100
    );
    
    const quoteReserveSol = Number(quoteReserve) / 1e9;
    
    console.log(`[MeteoraCurve] Progress: ${progress.toFixed(1)}% (${quoteReserveSol.toFixed(9)} / ${MIGRATION_THRESHOLD_SOL} SOL threshold)`);
    
    return {
      progress,
      quoteReserve: quoteReserveSol,
      threshold: MIGRATION_THRESHOLD_SOL
    };
  } catch (e) {
    console.log('[MeteoraCurve] Error:', e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

// ============================================
// RAYDIUM LAUNCHLAB STATE (Bonk.fun) - On-Chain via Helius RPC  
// ============================================

export interface LaunchlabCurveState {
  isOnCurve: boolean;
  progress: number;  // 0-100
  tokenBalance: bigint;
  tokensToSell: bigint;
}

/**
 * Fetch bonding curve state for Bonk.fun tokens (Raydium Launchlab)
 * 
 * Progress formula: 100 - (((balance - 206.9M) * 100) / 793.1M)
 * When balance reaches ~206.9M tokens, the curve is complete (100%)
 */
export async function fetchRaydiumLaunchlab(
  tokenMint: string,
  heliusApiKey: string
): Promise<LaunchlabCurveState | null> {
  try {
    const { Connection, PublicKey, TOKEN_PROGRAM_ID } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);
    const mint = new PublicKey(tokenMint);

    // Find the pool/vault PDA that holds the tokens
    // Seeds typically: ['pool', token_mint] or similar
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), mint.toBuffer()],
      programId
    );

    // Get the token account for this pool
    const tokenAccounts = await connection.getTokenAccountsByOwner(poolPda, {
      mint: mint,
    });

    if (tokenAccounts.value.length === 0) {
      // Try alternate PDA derivation
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), mint.toBuffer()],
        programId
      );
      
      const vaultAccounts = await connection.getTokenAccountsByOwner(vaultPda, {
        mint: mint,
      });

      if (vaultAccounts.value.length === 0) {
        console.log(`[Launchlab] No token account found for ${tokenMint.slice(0, 8)}`);
        return null;
      }

      tokenAccounts.value = vaultAccounts.value;
    }

    // Parse token account to get balance
    const accountInfo = tokenAccounts.value[0].account;
    const data = accountInfo.data;
    
    // SPL Token Account layout: mint (32) + owner (32) + amount (8) + ...
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tokenBalance = view.getBigUint64(64, true);

    // Calculate progress using the formula
    // progress = 100 - (((balance - 206.9M) * 100) / 793.1M)
    const adjustedBalance = tokenBalance > LAUNCHLAB_DEAD_BALANCE 
      ? tokenBalance - LAUNCHLAB_DEAD_BALANCE 
      : 0n;
    
    const tokensToSell = LAUNCHLAB_INITIAL_TOKEN_BALANCE;
    const progress = 100 - Number((adjustedBalance * 100n) / tokensToSell);
    const normalizedProgress = Math.min(Math.max(progress, 0), 100);

    const isOnCurve = tokenBalance > LAUNCHLAB_DEAD_BALANCE;

    console.log(`[Launchlab] ${tokenMint.slice(0, 8)}: balance=${Number(tokenBalance) / 1e6}M, progress=${normalizedProgress.toFixed(1)}%, onCurve=${isOnCurve}`);

    return {
      isOnCurve,
      progress: normalizedProgress,
      tokenBalance,
      tokensToSell,
    };
  } catch (e) {
    console.log('[Launchlab] Fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// PUMP.FUN API PRICE (HTTP endpoint)
// ============================================

async function fetchPumpFunApiPrice(tokenMint: string, solPriceUsd: number): Promise<PriceResult | null> {
  const start = Date.now();
  
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      console.log(`pump.fun API returned ${res.status} for ${tokenMint}`);
      return null;
    }

    const data = await res.json();
    const latencyMs = Date.now() - start;

    // Check if token has graduated (complete = true means moved to Raydium)
    const isComplete = data.complete === true;
    
    // Method 1: Use market cap and supply
    if (data.usd_market_cap && data.total_supply) {
      const price = data.usd_market_cap / (data.total_supply / 1e6);
      return {
        price,
        source: 'pumpfun_api',
        fetchedAt: new Date().toISOString(),
        latencyMs,
        isOnCurve: !isComplete,
        bondingCurveProgress: isComplete ? 100 : undefined,
        confidence: 'high'
      };
    }

    // Method 2: Use bonding curve reserves from API
    if (data.virtual_sol_reserves && data.virtual_token_reserves) {
      const priceInSol = (data.virtual_sol_reserves / 1e9) / (data.virtual_token_reserves / 1e6);
      const price = priceInSol * solPriceUsd;
      
      // Calculate progress if we have real reserves
      let progress: number | undefined;
      if (data.real_token_reserves !== undefined) {
        const tokensSold = Number(INITIAL_REAL_TOKEN_RESERVES) - data.real_token_reserves;
        progress = Math.min(Math.max((tokensSold / Number(INITIAL_REAL_TOKEN_RESERVES)) * 100, 0), 100);
      }

      return {
        price,
        source: 'pumpfun_api',
        fetchedAt: new Date().toISOString(),
        latencyMs,
        isOnCurve: !isComplete,
        bondingCurveProgress: progress,
        confidence: 'high',
        virtualSolReserves: data.virtual_sol_reserves,
        virtualTokenReserves: data.virtual_token_reserves
      };
    }

    return null;
  } catch (e) {
    console.log('pump.fun API failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// DEXSCREENER PRICE (Best for graduated tokens)
// ============================================

/**
 * Fetch price from DexScreener
 * CRITICAL FIX: Select HIGHEST USD LIQUIDITY pair to avoid spoofed/low-liquidity pairs
 * 
 * Returns additional metadata for graduation detection:
 * - dexId: "bags" = on bonding curve, "meteora"/"raydium" = graduated
 * - liquidity: Real AMM pools have substantial liquidity (>$1000)
 */
interface DexScreenerResult extends PriceResult {
  dexId?: string;
  liquidityUsd?: number;
}

async function fetchDexScreenerPrice(tokenMint: string): Promise<DexScreenerResult | null> {
  const start = Date.now();
  
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const pairs = data?.pairs || [];
    
    if (pairs.length === 0) {
      return null;
    }

    // CRITICAL: Sort by USD liquidity descending and pick the highest
    // This prevents using spoofed low-liquidity pairs that can show fake prices
    const sortedPairs = pairs.sort((a: any, b: any) => {
      const liquidityA = Number(a.liquidity?.usd) || 0;
      const liquidityB = Number(b.liquidity?.usd) || 0;
      return liquidityB - liquidityA;
    });
    
    const bestPair = sortedPairs[0];
    
    if (!bestPair?.priceUsd) {
      return null;
    }

    const latencyMs = Date.now() - start;
    const liquidity = Number(bestPair.liquidity?.usd) || 0;
    const dexId = bestPair.dexId || 'unknown';

    console.log(`[DexScreener] Selected pair: dexId=${dexId}, $${liquidity.toFixed(0)} liquidity from ${pairs.length} pairs`);

    return {
      price: Number(bestPair.priceUsd),
      source: 'dexscreener',
      fetchedAt: new Date().toISOString(),
      latencyMs,
      isOnCurve: false, // Will be overridden by caller if needed
      confidence: liquidity > 10000 ? 'high' : liquidity > 1000 ? 'medium' : 'low',
      pairAddress: bestPair.pairAddress || undefined,
      dexId,
      liquidityUsd: liquidity
    };
  } catch (e) {
    console.log('DexScreener failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// JUPITER PRICE (Fallback)
// ============================================

async function fetchJupiterPrice(tokenMint: string): Promise<PriceResult | null> {
  const start = Date.now();
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`, {
      signal: AbortSignal.timeout(5000),
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const price = Number(json?.data?.[tokenMint]?.price);
    
    if (!price || price <= 0) {
      return null;
    }

    const latencyMs = Date.now() - start;

    return {
      price,
      source: 'jupiter',
      fetchedAt: new Date().toISOString(),
      latencyMs,
      isOnCurve: false,
      confidence: 'medium'
    };
  } catch (e) {
    console.log('Jupiter failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ============================================
// MAIN PRICE RESOLVER
// ============================================

export async function resolvePrice(
  tokenMint: string,
  options: {
    forceFresh?: boolean;
    heliusApiKey?: string;
  } = {}
): Promise<PriceResult | null> {
  const { forceFresh = false, heliusApiKey } = options;

  // Check cache first (unless force fresh)
  if (!forceFresh) {
    const cached = priceCache.get(tokenMint);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`Price cache hit for ${tokenMint}: $${cached.result.price} from ${cached.result.source}`);
      return cached.result;
    }
  }

  const solPrice = await fetchSolPrice();

  // ============================================
  // ROUTING LOGIC - Multi-Platform Detection
  // ============================================
  // Priority order:
  // 1. pump.fun API (handles pump.fun tokens)
  // 2. pump.fun on-chain bonding curve (fallback for old pump tokens)
  // 3. Meteora DBC on-chain (handles bags.fm tokens)
  // 4. Raydium Launchlab on-chain (handles Bonk.fun tokens)
  // 5. DexScreener (graduated tokens on any DEX)
  // 6. Jupiter (last resort fallback)

  // STEP 1: Try pump.fun API for ALL tokens (handles both old and new pump tokens)
  console.log(`[${tokenMint.slice(0, 8)}] Trying pump.fun API`);
  const pumpResult = await fetchPumpFunApiPrice(tokenMint, solPrice);
  
  if (pumpResult) {
    console.log(`[${tokenMint.slice(0, 8)}] pump.fun API: $${pumpResult.price.toFixed(10)}, onCurve=${pumpResult.isOnCurve}`);
    
    // If token is still on curve, this is authoritative - use it
    if (pumpResult.isOnCurve) {
      priceCache.set(tokenMint, { result: pumpResult, timestamp: Date.now() });
      return pumpResult;
    }
    
    // Token graduated according to pump.fun - fall through to other checks
  }

  // STEP 2: Try pump.fun on-chain bonding curve (catches old pump tokens API might miss)
  if (heliusApiKey) {
    console.log(`[${tokenMint.slice(0, 8)}] Trying pump.fun on-chain curve`);
    const curveState = await fetchBondingCurveState(tokenMint, heliusApiKey);
    
    if (curveState) {
      if (curveState.isOnCurve) {
        // Token IS on pump.fun curve - use curve price (authoritative)
        const price = computeBondingCurvePrice(curveState, solPrice);
        const result: PriceResult = {
          price,
          source: 'pumpfun_curve',
          fetchedAt: new Date().toISOString(),
          latencyMs: 0,
          isOnCurve: true,
          bondingCurveProgress: curveState.progress,
          confidence: 'high',
          virtualSolReserves: Number(curveState.virtualSolReserves),
          virtualTokenReserves: Number(curveState.virtualTokenReserves)
        };
        
        console.log(`[${tokenMint.slice(0, 8)}] pump.fun curve: $${price.toFixed(10)}, progress=${curveState.progress.toFixed(1)}%`);
        priceCache.set(tokenMint, { result, timestamp: Date.now() });
        return result;
      } else {
        console.log(`[${tokenMint.slice(0, 8)}] pump.fun confirms GRADUATED`);
      }
    }
  }

  // STEP 3: Try Meteora DBC (bags.fm tokens) - ONLY for BAGS suffix tokens
  // Skip this expensive scan for pump.fun tokens (already handled above)
  if (heliusApiKey && tokenMint.endsWith('BAGS')) {
    console.log(`[${tokenMint.slice(0, 8)}] Trying Meteora DBC (bags.fm)`);
    const meteoraState = await fetchMeteoraDBC(tokenMint, heliusApiKey);
    
    if (meteoraState && meteoraState.isOnCurve) {
      // Token IS on Meteora DBC - need to get price from DexScreener but mark as on curve
      const dexPrice = await fetchDexScreenerPrice(tokenMint);
      const price = dexPrice?.price || 0;
      
      const result: PriceResult = {
        price,
        source: 'meteora_dbc',
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        isOnCurve: true,
        bondingCurveProgress: meteoraState.progress,
        confidence: price > 0 ? 'high' : 'low'
      };
      
      console.log(`[${tokenMint.slice(0, 8)}] Meteora DBC: $${price.toFixed(10)}, progress=${meteoraState.progress.toFixed(1)}%`);
      priceCache.set(tokenMint, { result, timestamp: Date.now() });
      return result;
    }
    
    // On-chain scan failed - try bags.fm API as fallback to check graduation status
    console.log(`[${tokenMint.slice(0, 8)}] Meteora scan failed, trying bags.fm API fallback`);
    try {
      const bagsRes = await fetch(`https://api.bags.fm/api/v1/token/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      
      console.log(`[${tokenMint.slice(0, 8)}] bags.fm API status: ${bagsRes.status}`);
      
      if (bagsRes.ok) {
        const bagsData = await bagsRes.json();
        console.log(`[${tokenMint.slice(0, 8)}] bags.fm API response:`, JSON.stringify(bagsData).slice(0, 500));
        
        // Check multiple possible graduation flags
        const isGraduated = bagsData.graduated === true || 
                           bagsData.migrated === true || 
                           bagsData.status === 'graduated' ||
                           bagsData.bondingCurve?.completed === true;
        
        // Also check for explicit on-curve indicators
        const hasActivePool = bagsData.pool || bagsData.bondingCurve;
        const curveProgress = bagsData.bondingCurve?.progress ?? bagsData.progress;
        
        console.log(`[${tokenMint.slice(0, 8)}] bags.fm API: graduated=${isGraduated}, hasPool=${!!hasActivePool}, progress=${curveProgress}`);
        
        // If NOT graduated OR has active pool with progress < 100
        if (!isGraduated || (curveProgress !== undefined && curveProgress < 100)) {
          // Token is on bags.fm curve - mark as on curve even if on-chain scan failed
          const dexPrice = await fetchDexScreenerPrice(tokenMint);
          const price = dexPrice?.price || 0;
          
          const result: PriceResult = {
            price,
            source: 'bags_fm_api',
            fetchedAt: new Date().toISOString(),
            latencyMs: 0,
            isOnCurve: true,
            bondingCurveProgress: curveProgress,
            confidence: price > 0 ? 'medium' : 'low'
          };
          
          console.log(`[${tokenMint.slice(0, 8)}] bags.fm API confirms on-curve: $${price.toFixed(10)}, progress=${curveProgress}`);
          priceCache.set(tokenMint, { result, timestamp: Date.now() });
          return result;
        }
      } else {
        // If API returns 404, token may have GRADUATED - check DexScreener for evidence
        console.log(`[${tokenMint.slice(0, 8)}] bags.fm API error (status ${bagsRes.status}) - checking graduation status`);
        const dexPrice = await fetchDexScreenerPrice(tokenMint);
        const price = dexPrice?.price || 0;
        
        // CRITICAL: Check if token has graduated to Meteora AMM
        // Graduated tokens have: dexId="meteora" (not "bags") AND real liquidity
        const dexId = (dexPrice as any)?.dexId || 'unknown';
        const liquidityUsd = (dexPrice as any)?.liquidityUsd || 0;
        const isGraduatedToAMM = dexId === 'meteora' && liquidityUsd > 1000;
        
        console.log(`[${tokenMint.slice(0, 8)}] DexScreener: dexId=${dexId}, liquidity=$${liquidityUsd.toFixed(0)}, graduated=${isGraduatedToAMM}`);
        
        if (isGraduatedToAMM) {
          // Token has GRADUATED - return as graduated, not on curve
          const result: PriceResult = {
            price,
            source: 'dexscreener',
            fetchedAt: new Date().toISOString(),
            latencyMs: 0,
            isOnCurve: false,
            bondingCurveProgress: 100, // Graduated = 100%
            confidence: 'high',
            pairAddress: dexPrice?.pairAddress
          };
          
          console.log(`[${tokenMint.slice(0, 8)}] GRADUATED to Meteora AMM: $${price.toFixed(10)}`);
          priceCache.set(tokenMint, { result, timestamp: Date.now() });
          return result;
        }
        
        // Still on curve (dexId="bags") - try to calculate progress from pool data using SDK
        let bondingCurveProgress: number | undefined;
        if (heliusApiKey && dexPrice?.pairAddress && dexId === 'bags') {
          const curveData = await fetchMeteoraCurveProgressFromPool(dexPrice.pairAddress, heliusApiKey);
          bondingCurveProgress = curveData?.progress;
          if (curveData) {
            console.log(`[${tokenMint.slice(0, 8)}] Meteora SDK progress: ${curveData.progress.toFixed(1)}% (${curveData.quoteReserve.toFixed(2)}/${curveData.threshold.toFixed(2)} SOL)`);
          }
        }
        
        const result: PriceResult = {
          price,
          source: 'bags_fm_fallback',
          fetchedAt: new Date().toISOString(),
          latencyMs: 0,
          isOnCurve: dexId === 'bags', // Only on-curve if dexId is "bags"
          bondingCurveProgress,
          confidence: bondingCurveProgress !== undefined ? 'medium' : 'low'
        };
        
        priceCache.set(tokenMint, { result, timestamp: Date.now() });
        return result;
      }
    } catch (bagsErr) {
      console.log(`[${tokenMint.slice(0, 8)}] bags.fm API fallback failed:`, bagsErr instanceof Error ? bagsErr.message : String(bagsErr));
      // On error, check DexScreener for graduation status
      const dexPrice = await fetchDexScreenerPrice(tokenMint);
      const price = dexPrice?.price || 0;
      
      // Check graduation status from DexScreener
      const dexId = (dexPrice as any)?.dexId || 'unknown';
      const liquidityUsd = (dexPrice as any)?.liquidityUsd || 0;
      const isGraduatedToAMM = dexId === 'meteora' && liquidityUsd > 1000;
      
      console.log(`[${tokenMint.slice(0, 8)}] DexScreener fallback: dexId=${dexId}, liquidity=$${liquidityUsd.toFixed(0)}, graduated=${isGraduatedToAMM}`);
      
      if (isGraduatedToAMM) {
        const result: PriceResult = {
          price,
          source: 'dexscreener',
          fetchedAt: new Date().toISOString(),
          latencyMs: 0,
          isOnCurve: false,
          bondingCurveProgress: 100,
          confidence: 'high',
          pairAddress: dexPrice?.pairAddress
        };
        
        console.log(`[${tokenMint.slice(0, 8)}] GRADUATED to Meteora AMM: $${price.toFixed(10)}`);
        priceCache.set(tokenMint, { result, timestamp: Date.now() });
        return result;
      }
      
      // Still on curve - try pool lookup for progress using SDK
      let bondingCurveProgress: number | undefined;
      if (heliusApiKey && dexPrice?.pairAddress && dexId === 'bags') {
        const curveData = await fetchMeteoraCurveProgressFromPool(dexPrice.pairAddress, heliusApiKey);
        bondingCurveProgress = curveData?.progress;
        if (curveData) {
          console.log(`[${tokenMint.slice(0, 8)}] Meteora SDK progress: ${curveData.progress.toFixed(1)}% (${curveData.quoteReserve.toFixed(2)}/${curveData.threshold.toFixed(2)} SOL)`);
        }
      }
      
      const result: PriceResult = {
        price,
        source: 'bags_fm_error_fallback',
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        isOnCurve: dexId === 'bags',
        bondingCurveProgress,
        confidence: bondingCurveProgress !== undefined ? 'medium' : 'low'
      };
      
      priceCache.set(tokenMint, { result, timestamp: Date.now() });
      return result;
    }
  }

  // STEP 4: Try Raydium Launchlab (Bonk.fun tokens) - ONLY for BONK suffix tokens
  if (heliusApiKey && (tokenMint.endsWith('BONK') || tokenMint.endsWith('bonk'))) {
    console.log(`[${tokenMint.slice(0, 8)}] Trying Raydium Launchlab (Bonk.fun)`);
    const launchlabState = await fetchRaydiumLaunchlab(tokenMint, heliusApiKey);
    
    if (launchlabState && launchlabState.isOnCurve) {
      // Token IS on Launchlab curve - need to get price from DexScreener but mark as on curve
      const dexPrice = await fetchDexScreenerPrice(tokenMint);
      const price = dexPrice?.price || 0;
      
      const result: PriceResult = {
        price,
        source: 'raydium_launchlab',
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        isOnCurve: true,
        bondingCurveProgress: launchlabState.progress,
        confidence: price > 0 ? 'high' : 'low'
      };
      
      console.log(`[${tokenMint.slice(0, 8)}] Raydium Launchlab: $${price.toFixed(10)}, progress=${launchlabState.progress.toFixed(1)}%`);
      priceCache.set(tokenMint, { result, timestamp: Date.now() });
      return result;
    }
  }

  // STEP 5: Try DexScreener (best for graduated tokens)
  console.log(`[${tokenMint.slice(0, 8)}] Trying DexScreener`);
  const dexResult = await fetchDexScreenerPrice(tokenMint);
  
  if (dexResult) {
    console.log(`[${tokenMint.slice(0, 8)}] DexScreener: $${dexResult.price.toFixed(10)}`);
    priceCache.set(tokenMint, { result: dexResult, timestamp: Date.now() });
    return dexResult;
  }

  // STEP 6: Jupiter fallback
  console.log(`[${tokenMint.slice(0, 8)}] Trying Jupiter (fallback)`);
  const jupResult = await fetchJupiterPrice(tokenMint);
  
  if (jupResult) {
    console.log(`[${tokenMint.slice(0, 8)}] Jupiter: $${jupResult.price.toFixed(10)}`);
    priceCache.set(tokenMint, { result: jupResult, timestamp: Date.now() });
    return jupResult;
  }

  console.log(`[${tokenMint.slice(0, 8)}] No price found from any source`);
  return null;
}

// ============================================
// BULK PRICE RESOLVER (for monitoring many positions)
// ============================================

export async function resolvePricesBulk(
  tokenMints: string[],
  options: {
    forceFresh?: boolean;
    heliusApiKey?: string;
    concurrency?: number;
  } = {}
): Promise<BulkPriceResult> {
  const { concurrency = 5 } = options;
  
  const prices: Record<string, number> = {};
  const metadata: Record<string, PriceResult> = {};
  
  // Process in batches to avoid overwhelming APIs
  for (let i = 0; i < tokenMints.length; i += concurrency) {
    const batch = tokenMints.slice(i, i + concurrency);
    
    const results = await Promise.all(
      batch.map(async (mint) => {
        const result = await resolvePrice(mint, options);
        return { mint, result };
      })
    );

    for (const { mint, result } of results) {
      if (result) {
        prices[mint] = result.price;
        metadata[mint] = result;
      }
    }
  }

  return { prices, metadata };
}

// ============================================
// VERIFY ENTRY FROM ON-CHAIN TRANSACTION (Helius)
// ============================================

export interface VerifiedEntry {
  tokensReceived: number;
  solSpent: number;
  feePaid: number;
  pricePerToken: number;
  timestamp: string;
}

/**
 * Verify buy transaction using on-chain data.
 * 
 * CRITICAL: We calculate SOL spent using the wallet's actual balance delta,
 * NOT by summing nativeTransfers (which can double-count internal wraps).
 */
export async function verifyBuyFromChain(
  signature: string,
  tokenMint: string,
  heliusApiKey: string,
  walletPubkey: string  // NEW: Required to calculate correct balance delta
): Promise<VerifiedEntry | null> {
  try {
    // Use Helius enhanced transaction API
    const res = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [signature] }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!res.ok) {
      console.log('Helius transaction parse failed:', res.status);
      return null;
    }

    const data = await res.json();
    const tx = data[0];

    if (!tx) {
      console.log('Transaction not found:', signature);
      return null;
    }

    // Find token transfer to wallet
    let tokensReceived = 0;
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint === tokenMint && transfer.tokenAmount > 0) {
          tokensReceived = transfer.tokenAmount;
          break;
        }
      }
    }

    // ============================================
    // FIX: Calculate SOL spent using wallet balance delta
    // NOT by summing nativeTransfers (which double-counts wraps)
    // ============================================
    let solSpent = 0;
    let solSpentCalculationMethod = 'unknown';

    // Method 1: Use accountData nativeBalanceChange (most reliable)
    if (tx.accountData && Array.isArray(tx.accountData)) {
      const walletAccount = tx.accountData.find(
        (a: any) => a.account === walletPubkey
      );
      if (walletAccount?.nativeBalanceChange !== undefined) {
        // nativeBalanceChange is negative when spending, so negate it
        solSpent = Math.abs(walletAccount.nativeBalanceChange) / 1e9;
        solSpentCalculationMethod = 'accountData.nativeBalanceChange';
        console.log(`SOL spent from accountData: ${solSpent} SOL`);
      }
    }

    // Method 2: Fallback to feePayer pre/post balance from meta
    if (solSpent === 0 && tx.meta?.preBalances && tx.meta?.postBalances) {
      // Find the fee payer index (usually 0)
      const feePayerIdx = tx.accountKeys?.findIndex(
        (k: any) => k.signer === true && k.writable === true
      ) ?? 0;
      
      if (tx.meta.preBalances[feePayerIdx] !== undefined && 
          tx.meta.postBalances[feePayerIdx] !== undefined) {
        const preBalance = tx.meta.preBalances[feePayerIdx];
        const postBalance = tx.meta.postBalances[feePayerIdx];
        solSpent = (preBalance - postBalance) / 1e9;
        solSpentCalculationMethod = 'meta.preBalances/postBalances';
        console.log(`SOL spent from balance delta: ${solSpent} SOL (pre=${preBalance}, post=${postBalance})`);
      }
    }

    // Method 3: Last resort - find a single outbound native transfer from our wallet
    // (only if there's exactly one, to avoid double-counting)
    if (solSpent === 0 && tx.nativeTransfers) {
      const outboundTransfers = tx.nativeTransfers.filter(
        (t: any) => t.fromUserAccount === walletPubkey && t.amount > 0
      );
      
      // Only use this if there's exactly one transfer to avoid double-counting
      if (outboundTransfers.length === 1) {
        solSpent = outboundTransfers[0].amount / 1e9;
        solSpentCalculationMethod = 'nativeTransfers (single)';
        console.log(`SOL spent from single native transfer: ${solSpent} SOL`);
      } else {
        console.log(`Skipping nativeTransfers: found ${outboundTransfers.length} outbound transfers (risk of double-count)`);
      }
    }

    // Get fee
    const feePaid = (tx.fee || 0) / 1e9;

    if (tokensReceived <= 0 || solSpent <= 0) {
      console.log(`Could not parse token/SOL amounts: tokens=${tokensReceived}, sol=${solSpent}, method=${solSpentCalculationMethod}`);
      return null;
    }

    const solPrice = await fetchSolPrice();
    const pricePerToken = (solSpent * solPrice) / tokensReceived;

    console.log(`Entry verified: ${tokensReceived} tokens for ${solSpent} SOL ($${(solSpent * solPrice).toFixed(4)}) = $${pricePerToken.toFixed(10)}/token [method: ${solSpentCalculationMethod}]`);

    return {
      tokensReceived,
      solSpent,
      feePaid,
      pricePerToken,
      timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString()
    };
  } catch (e) {
    console.log('Entry verification failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
