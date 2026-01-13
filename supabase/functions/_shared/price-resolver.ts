/**
 * PRICE RESOLVER - Token State Router
 * 
 * API Truth Table Implementation:
 * - Pre-Raydium (on bonding curve): pump.fun API -> bonding curve math
 * - Post-Raydium (graduated): DexScreener -> Jupiter fallback
 * 
 * This is the SINGLE SOURCE OF TRUTH for all price fetching across FlipIt.
 */

// ============================================
// TYPES
// ============================================

export type PriceSource = 
  | 'pumpfun_api'      // Fresh from pump.fun HTTP API
  | 'pumpfun_curve'    // Computed from on-chain bonding curve
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

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;

// Cache with 3-second TTL (short enough to be fresh, long enough to avoid spam)
const priceCache: Map<string, { result: PriceResult; timestamp: number }> = new Map();
const CACHE_TTL_MS = 3000;

// SOL price cache (slightly longer TTL since SOL moves slower)
let solPriceCache: { price: number; timestamp: number } | null = null;
const SOL_CACHE_TTL_MS = 10000;

// ============================================
// SOL PRICE
// ============================================

export async function fetchSolPrice(): Promise<number> {
  // Check cache
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_CACHE_TTL_MS) {
    return solPriceCache.price;
  }

  // Try Jupiter v2 first (most reliable)
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      const price = Number(json?.data?.['So11111111111111111111111111111111111111112']?.price);
      if (price > 0) {
        solPriceCache = { price, timestamp: Date.now() };
        return price;
      }
    }
  } catch (e) {
    console.log('Jupiter SOL price failed:', e instanceof Error ? e.message : String(e));
  }

  // Try CoinGecko fallback
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      const price = Number(json?.solana?.usd);
      if (price > 0) {
        solPriceCache = { price, timestamp: Date.now() };
        return price;
      }
    }
  } catch (e) {
    console.log('CoinGecko SOL price failed:', e instanceof Error ? e.message : String(e));
  }

  // Return cached or default
  return solPriceCache?.price || 180;
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

async function fetchDexScreenerPrice(tokenMint: string): Promise<PriceResult | null> {
  const start = Date.now();
  
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const pair = data?.pairs?.[0];
    
    if (!pair?.priceUsd) {
      return null;
    }

    const latencyMs = Date.now() - start;

    return {
      price: Number(pair.priceUsd),
      source: 'dexscreener',
      fetchedAt: new Date().toISOString(),
      latencyMs,
      isOnCurve: false, // DexScreener only has graduated tokens
      confidence: 'high'
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
  
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`, {
      signal: AbortSignal.timeout(5000)
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
  const isPumpToken = tokenMint.toLowerCase().endsWith('pump');

  // ============================================
  // ROUTING LOGIC
  // ============================================

  // STEP 1: For pump.fun tokens, try pump.fun API first (freshest for curve tokens)
  if (isPumpToken) {
    console.log(`[${tokenMint.slice(0, 8)}] Trying pump.fun API (pump token detected)`);
    const pumpResult = await fetchPumpFunApiPrice(tokenMint, solPrice);
    
    if (pumpResult) {
      console.log(`[${tokenMint.slice(0, 8)}] pump.fun API: $${pumpResult.price.toFixed(10)}, onCurve=${pumpResult.isOnCurve}`);
      
      // If token is still on curve, this is authoritative - use it
      if (pumpResult.isOnCurve) {
        priceCache.set(tokenMint, { result: pumpResult, timestamp: Date.now() });
        return pumpResult;
      }
      
      // Token graduated - pump.fun API may still return price, but prefer DexScreener
      // Fall through to DexScreener check
    }
  }

  // STEP 2: For pump tokens, try on-chain bonding curve (fallback if API blocked)
  if (isPumpToken && heliusApiKey) {
    console.log(`[${tokenMint.slice(0, 8)}] Trying on-chain bonding curve`);
    const curveState = await fetchBondingCurveState(tokenMint, heliusApiKey);
    
    if (curveState && curveState.isOnCurve) {
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
      
      console.log(`[${tokenMint.slice(0, 8)}] On-chain curve: $${price.toFixed(10)}, progress=${curveState.progress.toFixed(1)}%`);
      priceCache.set(tokenMint, { result, timestamp: Date.now() });
      return result;
    }
  }

  // STEP 3: Try DexScreener (best for graduated tokens)
  console.log(`[${tokenMint.slice(0, 8)}] Trying DexScreener`);
  const dexResult = await fetchDexScreenerPrice(tokenMint);
  
  if (dexResult) {
    console.log(`[${tokenMint.slice(0, 8)}] DexScreener: $${dexResult.price.toFixed(10)}`);
    priceCache.set(tokenMint, { result: dexResult, timestamp: Date.now() });
    return dexResult;
  }

  // STEP 4: Jupiter fallback
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
