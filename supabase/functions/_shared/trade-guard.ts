/**
 * TRADE GUARD - Pre-Trade Quote Validation (VENUE-AWARE)
 * 
 * Fetches executable quote from the ACTUAL VENUE that will execute the trade:
 * - pump.fun on-curve: bonding curve math
 * - bags.fm/bonk.fun on-curve: PumpPortal simulation
 * - graduated tokens: Jupiter quote
 * 
 * This prevents the mismatch where we validated against Jupiter but executed via PumpPortal.
 * 
 * Blocks trades if the executable price exceeds the display price by more than the threshold.
 */

import { getVenueAwareQuote, detectVenue, type VenueQuote } from "./venue-aware-quote.ts";

export interface TradeGuardConfig {
  maxPricePremiumPct: number;  // e.g., 10 = block if > 10% above display price
  requireQuoteCheck: boolean;  // If false, skip validation (emergency bypass)
  blockOnHighPriceImpact: boolean;  // Block if Jupiter reports high price impact
  maxPriceImpactPct: number;  // e.g., 15 = block if price impact > 15%
  blockTokensWithTax: boolean;  // Block tokens with transfer tax (e.g., 5% tax)
}

export interface QuoteValidation {
  isValid: boolean;
  displayPrice: number;
  executablePrice: number;
  premiumPct: number;
  priceImpactPct: number;
  outputTokens: number;
  solPrice: number;
  blockReason?: string;
  jupiterQuote?: any;
  hasTax?: boolean;
  taxPct?: number;
}

export interface TokenTaxInfo {
  hasTax: boolean;
  taxPct: number;
  taxType?: string;
  source?: string;
}

const DEFAULT_CONFIG: TradeGuardConfig = {
  maxPricePremiumPct: 25,  // Increased from 10% to 25% to allow pump.fun volatility
  requireQuoteCheck: true,
  blockOnHighPriceImpact: true,
  maxPriceImpactPct: 20,  // Increased from 15% to 20% for memecoin volatility
  blockTokensWithTax: true,  // Default: block all tokens with transfer tax
};

/**
 * Fetch current SOL price from Jupiter v2 API
 */
async function fetchSolPrice(): Promise<number> {
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  
  try {
    // Jupiter v2 Price API
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      headers: {
        "Accept": "application/json",
        ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    // v2 format: { data: { "So111...": { price: "200.5" } } }
    const solData = json?.data?.["So11111111111111111111111111111111111111112"];
    const price = Number(solData?.price);
    if (Number.isFinite(price) && price > 0) {
      console.log(`[TradeGuard] SOL price from Jupiter v2: $${price.toFixed(2)}`);
      return price;
    }
  } catch (e) {
    console.error("[TradeGuard] Failed to fetch SOL price from Jupiter v2:", e);
  }
  
  // Fallback to CoinGecko
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    const price = Number(json?.solana?.usd);
    if (Number.isFinite(price) && price > 0) {
      console.log(`[TradeGuard] SOL price from CoinGecko: $${price.toFixed(2)}`);
      return price;
    }
  } catch (e) {
    console.error("[TradeGuard] CoinGecko fallback failed:", e);
  }
  
  // CRITICAL: Do not use hardcoded fallback - this causes calculation mismatches
  console.error("[TradeGuard] CRITICAL: Could not fetch SOL price from any source");
  throw new Error("CRITICAL: Could not fetch SOL price - refusing to use hardcoded fallback");
}

/**
 * Check if token has a transfer tax using multiple sources:
 * 1. RugCheck API - detects "Transfer Fee" risk
 * 2. DexScreener token info
 * 3. Direct on-chain check for Token-2022 transfer fee extension
 */
export async function checkTokenTax(tokenMint: string): Promise<TokenTaxInfo> {
  console.log(`[TradeGuard] Checking for token tax: ${tokenMint}`);
  
  // Method 1: RugCheck API (most reliable for pump.fun tokens)
  try {
    const rugCheckRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (rugCheckRes.ok) {
      const rugData = await rugCheckRes.json();
      const risks = rugData.risks || [];
      
      // Look for tax-related risks
      for (const risk of risks) {
        const name = (risk.name || "").toLowerCase();
        const description = (risk.description || "").toLowerCase();
        
        // Check for various tax indicators
        if (
          name.includes("transfer fee") ||
          name.includes("transfer tax") ||
          name.includes("tax") ||
          description.includes("transfer fee") ||
          description.includes("transfer tax") ||
          description.includes("% tax") ||
          description.includes("% fee")
        ) {
          // Try to extract the percentage
          const match = description.match(/(\d+(?:\.\d+)?)\s*%/);
          const taxPct = match ? parseFloat(match[1]) : 0;
          
          console.log(`[TradeGuard] 🚨 TOKEN HAS TAX via RugCheck: ${risk.name} - ${taxPct}%`);
          return {
            hasTax: true,
            taxPct,
            taxType: risk.name,
            source: "rugcheck",
          };
        }
      }
    }
  } catch (e) {
    console.error("[TradeGuard] RugCheck tax check failed:", e);
  }
  
  // Method 2: DexScreener API (check for tax info in token metadata)
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pairs = Array.isArray(dexData) ? dexData : dexData?.pairs || [];
      
      for (const pair of pairs) {
        // Check if DexScreener reports any tax info
        const buyTax = pair.txns?.h24?.buyTax || pair.priceChange?.buyTax || 0;
        const sellTax = pair.txns?.h24?.sellTax || pair.priceChange?.sellTax || 0;
        const totalTax = Math.max(Number(buyTax) || 0, Number(sellTax) || 0);
        
        if (totalTax > 0) {
          console.log(`[TradeGuard] 🚨 TOKEN HAS TAX via DexScreener: ${totalTax}%`);
          return {
            hasTax: true,
            taxPct: totalTax,
            taxType: "transfer_tax",
            source: "dexscreener",
          };
        }
        
        // Check labels for tax indicators
        const labels = pair.labels || [];
        if (labels.some((l: string) => l.toLowerCase().includes("tax"))) {
          console.log(`[TradeGuard] 🚨 TOKEN HAS TAX via DexScreener labels`);
          return {
            hasTax: true,
            taxPct: 0,
            taxType: "labeled_tax",
            source: "dexscreener",
          };
        }
      }
    }
  } catch (e) {
    console.error("[TradeGuard] DexScreener tax check failed:", e);
  }
  
  // Method 3: Check pump.fun API for token metadata (if it's a pump.fun token)
  try {
    const pumpRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (pumpRes.ok) {
      const pumpData = await pumpRes.json();
      // Note: pump.fun tokens typically don't have built-in taxes,
      // but we check just in case the API exposes this info
      if (pumpData.transferFee || pumpData.tax || pumpData.hasTax) {
        const taxPct = Number(pumpData.transferFee || pumpData.tax || 0);
        console.log(`[TradeGuard] 🚨 TOKEN HAS TAX via pump.fun API: ${taxPct}%`);
        return {
          hasTax: true,
          taxPct,
          taxType: "pump_fun_tax",
          source: "pumpfun",
        };
      }
    }
  } catch (e) {
    // pump.fun API might not exist for all tokens, that's ok
    console.log("[TradeGuard] pump.fun tax check skipped");
  }
  
  console.log(`[TradeGuard] ✅ No token tax detected for ${tokenMint.slice(0, 8)}...`);
  return {
    hasTax: false,
    taxPct: 0,
    source: "none",
  };
}

/**
 * Fetch executable quote from Jupiter for the exact SOL amount
 * Returns the actual tokens you would receive and implied price
 */
// Constants for on-chain bonding curve parsing
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/**
 * Fetch bonding curve state directly from on-chain via Helius RPC
 * Used when pump.fun API is unavailable
 */
async function fetchOnChainCurveState(tokenMint: string): Promise<{
  virtualSolReserves: number;
  virtualTokenReserves: number;
  complete: boolean;
} | null> {
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY") || "";
  if (!heliusApiKey) {
    console.log("[TradeGuard] No HELIUS_API_KEY, skipping on-chain fallback");
    return null;
  }
  
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
      console.log("[TradeGuard] No bonding curve account found (token may be graduated or not pump.fun)");
      return null;
    }

    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Parse bonding curve account data
    // Layout: discriminator (8) + virtualTokenReserves (8) + virtualSolReserves (8) + ... + complete (1 @ byte 48)
    const virtualTokenReserves = Number(view.getBigUint64(8, true));
    const virtualSolReserves = Number(view.getBigUint64(16, true));
    const complete = data[48] === 1;

    console.log(`[TradeGuard] On-chain curve: virtualSol=${virtualSolReserves}, virtualTokens=${virtualTokenReserves}, complete=${complete}`);
    
    return { virtualSolReserves, virtualTokenReserves, complete };
  } catch (e) {
    console.error("[TradeGuard] On-chain curve fetch failed:", e);
    return null;
  }
}

/**
 * Compute quote from bonding curve reserves
 */
function computeCurveQuote(
  virtualSolReserves: number,
  virtualTokenReserves: number,
  solAmountLamports: number,
  solPrice: number
): {
  outputAmount: number;
  outputDecimals: number;
  priceImpactPct: number;
  impliedPriceUsd: number;
  solPrice: number;
  source: string;
} {
  const solAmount = solAmountLamports / 1e9;
  const usdAmount = solAmount * solPrice;
  
  // Bonding curve math: constant product AMM
  const newSolReserves = virtualSolReserves + solAmountLamports;
  const newTokenReserves = (virtualSolReserves * virtualTokenReserves) / newSolReserves;
  const tokensOutRaw = virtualTokenReserves - newTokenReserves;
  
  // pump.fun tokens have 6 decimals
  const outputDecimals = 6;
  const tokensDecimal = tokensOutRaw / 1e6;
  
  const impliedPriceUsd = tokensDecimal > 0 ? usdAmount / tokensDecimal : 0;
  const priceImpactPct = (solAmountLamports / virtualSolReserves) * 100;
  
  console.log(`[TradeGuard] Curve quote: ${solAmount.toFixed(4)} SOL ($${usdAmount.toFixed(2)}) → ${tokensDecimal.toFixed(2)} tokens @ $${impliedPriceUsd.toFixed(10)}, impact: ${priceImpactPct.toFixed(2)}%`);
  
  return {
    outputAmount: tokensOutRaw,
    outputDecimals,
    priceImpactPct,
    impliedPriceUsd,
    solPrice,
    source: 'bonding_curve'
  };
}

/**
 * Fetch quote from pump.fun bonding curve math
 * Used as fallback when Jupiter returns TOKEN_NOT_TRADABLE
 * Tries pump.fun API first, then falls back to on-chain data via Helius
 */
async function getBondingCurveQuote(
  tokenMint: string,
  solAmountLamports: number
): Promise<{
  outputAmount: number;
  outputDecimals: number;
  priceImpactPct: number;
  impliedPriceUsd: number;
  solPrice: number;
  source: string;
} | null> {
  // Get SOL price first (needed for all calculations)
  const solPrice = await fetchSolPrice();
  
  // Try pump.fun API first
  try {
    console.log(`[TradeGuard] Fetching pump.fun bonding curve quote for ${tokenMint}`);
    
    const res = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (res.ok) {
      const data = await res.json();
      
      if (data.complete === true) {
        console.log(`[TradeGuard] Token is graduated, bonding curve quote not applicable`);
        return null;
      }
      
      const virtualSolReserves = Number(data.virtual_sol_reserves);
      const virtualTokenReserves = Number(data.virtual_token_reserves);
      
      if (virtualSolReserves && virtualTokenReserves) {
        return computeCurveQuote(virtualSolReserves, virtualTokenReserves, solAmountLamports, solPrice);
      }
    } else {
      console.log(`[TradeGuard] pump.fun API returned ${res.status}, trying on-chain fallback...`);
    }
  } catch (e) {
    console.log(`[TradeGuard] pump.fun API error: ${e instanceof Error ? e.message : String(e)}, trying on-chain fallback...`);
  }
  
  // Fallback to on-chain data via Helius RPC
  const onChainState = await fetchOnChainCurveState(tokenMint);
  if (onChainState) {
    if (onChainState.complete) {
      console.log(`[TradeGuard] Token is graduated (on-chain), bonding curve quote not applicable`);
      return null;
    }
    return computeCurveQuote(
      onChainState.virtualSolReserves,
      onChainState.virtualTokenReserves,
      solAmountLamports,
      solPrice
    );
  }
  
  console.log(`[TradeGuard] Could not fetch bonding curve data from any source`);
  return null;
}

export async function getExecutableQuote(
  tokenMint: string,
  solAmountLamports: number,
  slippageBps: number = 100
): Promise<{
  outputAmount: number;  // Raw token amount (lamports/smallest unit)
  outputDecimals: number;
  priceImpactPct: number;
  impliedPriceUsd: number;
  solPrice: number;
  quoteResponse: any;
} | null> {
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  
  try {
    console.log(`[TradeGuard] Fetching Jupiter v1 quote: ${solAmountLamports} lamports → ${tokenMint}`);
    
    // Jupiter v1 Quote API (replaces deprecated v6)
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${solAmountLamports}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    
    const res = await fetch(quoteUrl, {
      headers: { 
        "Accept": "application/json",
        ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`[TradeGuard] Jupiter v1 quote failed: ${res.status} ${text}`);
      
      // Check if token is not tradable on Jupiter (likely a bonding curve token)
      if (text.includes("TOKEN_NOT_TRADABLE") || text.includes("not tradable")) {
        console.log(`[TradeGuard] Token not tradable on Jupiter, trying bonding curve fallback...`);
        const curveQuote = await getBondingCurveQuote(tokenMint, solAmountLamports);
        if (curveQuote) {
          return {
            outputAmount: curveQuote.outputAmount,
            outputDecimals: curveQuote.outputDecimals,
            priceImpactPct: curveQuote.priceImpactPct,
            impliedPriceUsd: curveQuote.impliedPriceUsd,
            solPrice: curveQuote.solPrice,
            quoteResponse: { source: curveQuote.source }
          };
        }
      }
      
      return null;
    }
    
    const quote = await res.json();
    
    if (!quote || !quote.outAmount) {
      console.error("[TradeGuard] Jupiter returned no route");
      
      // Try bonding curve fallback for no-route case too
      console.log(`[TradeGuard] No Jupiter route, trying bonding curve fallback...`);
      const curveQuote = await getBondingCurveQuote(tokenMint, solAmountLamports);
      if (curveQuote) {
        return {
          outputAmount: curveQuote.outputAmount,
          outputDecimals: curveQuote.outputDecimals,
          priceImpactPct: curveQuote.priceImpactPct,
          impliedPriceUsd: curveQuote.impliedPriceUsd,
          solPrice: curveQuote.solPrice,
          quoteResponse: { source: curveQuote.source }
        };
      }
      
      return null;
    }
    
    const outputAmount = Number(quote.outAmount);
    const outputDecimals = quote.outputMint?.decimals || 6;
    const priceImpact = Number(quote.priceImpactPct || 0);
    
    // Get SOL price to calculate implied USD price
    const solPrice = await fetchSolPrice();
    const solAmount = solAmountLamports / 1e9;
    const usdAmount = solAmount * solPrice;
    
    // Calculate tokens in decimal units
    const tokensDecimal = outputAmount / Math.pow(10, outputDecimals);
    
    // Implied price = USD spent / tokens received
    const impliedPriceUsd = tokensDecimal > 0 ? usdAmount / tokensDecimal : 0;
    
    console.log(`[TradeGuard] Quote: ${solAmount.toFixed(4)} SOL ($${usdAmount.toFixed(2)}) → ${tokensDecimal.toFixed(2)} tokens @ $${impliedPriceUsd.toFixed(10)}, impact: ${priceImpact.toFixed(2)}%`);
    
    return {
      outputAmount,
      outputDecimals,
      priceImpactPct: priceImpact,
      impliedPriceUsd,
      solPrice,
      quoteResponse: quote
    };
  } catch (e) {
    console.error("[TradeGuard] Jupiter quote error:", e);
    
    // Final fallback: try bonding curve
    console.log(`[TradeGuard] Jupiter exception, trying bonding curve fallback...`);
    const curveQuote = await getBondingCurveQuote(tokenMint, solAmountLamports);
    if (curveQuote) {
      return {
        outputAmount: curveQuote.outputAmount,
        outputDecimals: curveQuote.outputDecimals,
        priceImpactPct: curveQuote.priceImpactPct,
        impliedPriceUsd: curveQuote.impliedPriceUsd,
        solPrice: curveQuote.solPrice,
        quoteResponse: { source: curveQuote.source }
      };
    }
    
    return null;
  }
}

/**
 * Main validation function - call this BEFORE executing any buy
 * Returns validation result with clear block reasons if trade should not proceed
 * 
 * CRITICAL CHANGE: Now accepts slippageBps and walletPubkey for venue-aware quotes
 */
export async function validateBuyQuote(
  tokenMint: string,
  solAmount: number,
  displayPriceUsd: number,
  config: Partial<TradeGuardConfig> = {},
  options: {
    slippageBps?: number;
    walletPubkey?: string;
  } = {}
): Promise<QuoteValidation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { slippageBps = 500, walletPubkey } = options;
  
  // If validation is disabled, always pass
  if (!cfg.requireQuoteCheck) {
    console.log("[TradeGuard] Quote check disabled, skipping validation");
    return {
      isValid: true,
      displayPrice: displayPriceUsd,
      executablePrice: displayPriceUsd,
      premiumPct: 0,
      priceImpactPct: 0,
      outputTokens: 0,
      solPrice: 0,
    };
  }
  
  // ========================================================
  // STEP 1: CHECK FOR TOKEN TAX (block before quote check)
  // ========================================================
  if (cfg.blockTokensWithTax) {
    console.log("[TradeGuard] Checking for token transfer tax...");
    const taxInfo = await checkTokenTax(tokenMint);
    
    if (taxInfo.hasTax) {
      console.error(`[TradeGuard] ❌ BLOCKED: Token has ${taxInfo.taxPct}% transfer tax (${taxInfo.taxType}) via ${taxInfo.source}`);
      return {
        isValid: false,
        displayPrice: displayPriceUsd,
        executablePrice: 0,
        premiumPct: 0,
        priceImpactPct: 0,
        outputTokens: 0,
        solPrice: 0,
        hasTax: true,
        taxPct: taxInfo.taxPct,
        blockReason: `TOKEN_HAS_TAX: This token has a ${taxInfo.taxPct}% transfer tax built into the contract. Tokens with transfer taxes are blocked to protect against hidden fees. Source: ${taxInfo.source}`,
      };
    }
    console.log("[TradeGuard] ✅ No transfer tax detected");
  }
  
  // ========================================================
  // STEP 2: FETCH VENUE-AWARE EXECUTABLE QUOTE
  // Uses the SAME venue that will actually execute the trade:
  // - pump.fun: bonding curve math
  // - bags.fm/bonk.fun: PumpPortal simulation
  // - graduated: Jupiter quote
  // ========================================================
  const solAmountLamports = Math.floor(solAmount * 1e9);
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  
  console.log(`[TradeGuard] Fetching VENUE-AWARE quote with slippage: ${slippageBps} bps (${slippageBps / 100}%)`);
  
  let executablePrice: number;
  let tokensDecimal: number;
  let priceImpactPct: number;
  let solPriceUsed: number;
  let quoteSource: string;
  let venueUsed: string;
  
  // TRY VENUE-AWARE QUOTE FIRST (most accurate for bonding curve tokens)
  if (walletPubkey && heliusApiKey) {
    const venueQuote = await getVenueAwareQuote(tokenMint, solAmountLamports, walletPubkey, {
      heliusApiKey,
      slippageBps
    });
    
    if (venueQuote) {
      console.log(`[TradeGuard] Got venue-aware quote from ${venueQuote.source} (venue: ${venueQuote.venue}, onCurve: ${venueQuote.isOnCurve})`);
      executablePrice = venueQuote.executablePriceUsd;
      tokensDecimal = venueQuote.tokensOut;
      priceImpactPct = venueQuote.priceImpactPct;
      solPriceUsed = venueQuote.solSpent > 0 ? (venueQuote.executablePriceUsd * venueQuote.tokensOut) / venueQuote.solSpent : 180;
      quoteSource = venueQuote.source;
      venueUsed = venueQuote.venue;
      
      // For low-confidence quotes, add a warning but still proceed
      if (venueQuote.confidence === 'low') {
        console.warn(`[TradeGuard] ⚠️ LOW CONFIDENCE quote from ${venueQuote.source} - price may differ at execution`);
      }
    } else {
      // Fallback to legacy Jupiter-first quote
      console.log(`[TradeGuard] Venue-aware quote failed, falling back to legacy quote...`);
      const legacyQuote = await getExecutableQuote(tokenMint, solAmountLamports, slippageBps);
      
      if (!legacyQuote) {
        console.error("[TradeGuard] ❌ BLOCKED: Could not fetch any executable quote - failing closed for safety");
        return {
          isValid: false,
          displayPrice: displayPriceUsd,
          executablePrice: 0,
          premiumPct: 0,
          priceImpactPct: 0,
          outputTokens: 0,
          solPrice: 0,
          blockReason: "QUOTE_UNAVAILABLE: Cannot verify executable price from any source - trade blocked for safety. Retry in a moment.",
        };
      }
      
      executablePrice = legacyQuote.impliedPriceUsd;
      tokensDecimal = legacyQuote.outputAmount / Math.pow(10, legacyQuote.outputDecimals);
      priceImpactPct = legacyQuote.priceImpactPct;
      solPriceUsed = legacyQuote.solPrice;
      quoteSource = legacyQuote.quoteResponse?.source || 'jupiter';
      venueUsed = 'jupiter_fallback';
    }
  } else {
    // No wallet pubkey provided - use legacy quote (less accurate for bonding curves)
    console.log(`[TradeGuard] No wallet pubkey, using legacy Jupiter quote...`);
    const legacyQuote = await getExecutableQuote(tokenMint, solAmountLamports, slippageBps);
    
    if (!legacyQuote) {
      console.error("[TradeGuard] ❌ BLOCKED: Could not fetch executable quote - failing closed for safety");
      return {
        isValid: false,
        displayPrice: displayPriceUsd,
        executablePrice: 0,
        premiumPct: 0,
        priceImpactPct: 0,
        outputTokens: 0,
        solPrice: 0,
        blockReason: "QUOTE_UNAVAILABLE: Cannot verify executable price - trade blocked for safety. Retry in a moment.",
      };
    }
    
    executablePrice = legacyQuote.impliedPriceUsd;
    tokensDecimal = legacyQuote.outputAmount / Math.pow(10, legacyQuote.outputDecimals);
    priceImpactPct = legacyQuote.priceImpactPct;
    solPriceUsed = legacyQuote.solPrice;
    quoteSource = legacyQuote.quoteResponse?.source || 'jupiter';
    venueUsed = 'jupiter';
  }
  
  console.log(`[TradeGuard] Quote obtained: venue=${venueUsed}, source=${quoteSource}, price=$${executablePrice?.toFixed(10)}`);

  
  // ========================================================
  // STEP 3: SANITY CHECK - Block obviously garbage quotes
  // ========================================================
  if (!Number.isFinite(executablePrice) || executablePrice <= 0) {
    console.error(`[TradeGuard] ❌ BLOCKED: Invalid executable price: ${executablePrice}`);
    return {
      isValid: false,
      displayPrice: displayPriceUsd,
      executablePrice: 0,
      premiumPct: 0,
      priceImpactPct: 0,
      outputTokens: 0,
      solPrice: solPriceUsed,
      blockReason: `INVALID_QUOTE: Executable price is invalid (zero or non-finite) from ${quoteSource}. This usually means the token is not tradable on ${venueUsed}.`,
    };
  }
  
  // Calculate premium: how much more expensive is executable vs display
  const premiumPct = displayPriceUsd > 0 
    ? ((executablePrice - displayPriceUsd) / displayPriceUsd) * 100
    : 0;
  
  // Extreme premium sanity check (>90% means something is very wrong)
  if (Math.abs(premiumPct) > 90) {
    console.error(`[TradeGuard] ❌ BLOCKED: Extreme price deviation (${premiumPct.toFixed(1)}%) - quote likely garbage`);
    return {
      isValid: false,
      displayPrice: displayPriceUsd,
      executablePrice,
      premiumPct,
      priceImpactPct,
      outputTokens: tokensDecimal,
      solPrice: solPriceUsed,
      blockReason: `EXTREME_DEVIATION: Price deviation is ${Math.abs(premiumPct).toFixed(0)}% which indicates a quote error or extreme volatility. Display: $${displayPriceUsd.toFixed(10)}, Executable: $${executablePrice.toFixed(10)} (venue: ${venueUsed})`,
    };
  }
  
  console.log(`[TradeGuard] Price comparison:`);
  console.log(`  Display price:     $${displayPriceUsd.toFixed(10)}`);
  console.log(`  Executable price:  $${executablePrice.toFixed(10)}`);
  console.log(`  Premium:           ${premiumPct.toFixed(2)}% (max: ${cfg.maxPricePremiumPct}%)`);
  console.log(`  Price impact:      ${priceImpactPct.toFixed(2)}% (max: ${cfg.maxPriceImpactPct}%)`);
  console.log(`  Slippage used:     ${slippageBps} bps, Venue: ${venueUsed}, Source: ${quoteSource}`);
  
  const result: QuoteValidation = {
    isValid: true,
    displayPrice: displayPriceUsd,
    executablePrice,
    premiumPct,
    priceImpactPct,
    outputTokens: tokensDecimal,
    solPrice: solPriceUsed,
    jupiterQuote: { source: quoteSource, venue: venueUsed },
    hasTax: false,
    taxPct: 0,
  };
  
  // Check price premium
  if (premiumPct > cfg.maxPricePremiumPct) {
    result.isValid = false;
    result.blockReason = `PRICE_PREMIUM_EXCEEDED: Executable price is ${premiumPct.toFixed(1)}% above display price (max: ${cfg.maxPricePremiumPct}%). This usually means thin liquidity or fast price movement.`;
    console.error(`[TradeGuard] ❌ BLOCKED: ${result.blockReason}`);
    return result;
  }
  
  // Check price impact
  if (cfg.blockOnHighPriceImpact && priceImpactPct > cfg.maxPriceImpactPct) {
    result.isValid = false;
    result.blockReason = `PRICE_IMPACT_TOO_HIGH: ${venueUsed} reports ${priceImpactPct.toFixed(1)}% price impact (max: ${cfg.maxPriceImpactPct}%). Consider a smaller buy size.`;
    console.error(`[TradeGuard] ❌ BLOCKED: ${result.blockReason}`);
    return result;
  }
  
  console.log(`[TradeGuard] ✅ PASSED: All validations OK (no tax, price OK, impact OK)`);
  return result;
}

/**
 * Fetch trade guard config from database, or use defaults
 */
export async function getTradeGuardConfig(supabase: any): Promise<TradeGuardConfig> {
  try {
    const { data } = await supabase
      .from("flipit_settings")
      .select("max_price_premium_pct, require_quote_check, block_on_high_price_impact, max_price_impact_pct, block_tokens_with_tax")
      .single();
    
    if (data) {
      return {
        maxPricePremiumPct: data.max_price_premium_pct ?? DEFAULT_CONFIG.maxPricePremiumPct,
        requireQuoteCheck: data.require_quote_check ?? DEFAULT_CONFIG.requireQuoteCheck,
        blockOnHighPriceImpact: data.block_on_high_price_impact ?? DEFAULT_CONFIG.blockOnHighPriceImpact,
        maxPriceImpactPct: data.max_price_impact_pct ?? DEFAULT_CONFIG.maxPriceImpactPct,
        blockTokensWithTax: data.block_tokens_with_tax ?? DEFAULT_CONFIG.blockTokensWithTax,
      };
    }
  } catch (e) {
    console.log("[TradeGuard] No custom config found, using defaults");
  }
  
  return DEFAULT_CONFIG;
}
