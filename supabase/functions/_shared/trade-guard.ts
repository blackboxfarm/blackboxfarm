/**
 * TRADE GUARD - Pre-Trade Quote Validation
 * 
 * Fetches executable quote from Jupiter BEFORE executing any trade.
 * Blocks trades if the executable price exceeds the display price by more than the threshold.
 * 
 * This prevents buying at 40% higher than expected due to:
 * - Thin liquidity causing high slippage
 * - Price moving during execution
 * - Stale display prices from DexScreener/pump.fun
 */

export interface TradeGuardConfig {
  maxPricePremiumPct: number;  // e.g., 10 = block if > 10% above display price
  requireQuoteCheck: boolean;  // If false, skip validation (emergency bypass)
  blockOnHighPriceImpact: boolean;  // Block if Jupiter reports high price impact
  maxPriceImpactPct: number;  // e.g., 15 = block if price impact > 15%
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
}

const DEFAULT_CONFIG: TradeGuardConfig = {
  maxPricePremiumPct: 10,
  requireQuoteCheck: true,
  blockOnHighPriceImpact: true,
  maxPriceImpactPct: 15,
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
  
  console.warn("[TradeGuard] Using fallback SOL price: $200");
  return 200;
}

/**
 * Fetch executable quote from Jupiter for the exact SOL amount
 * Returns the actual tokens you would receive and implied price
 */
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
      return null;
    }
    
    const quote = await res.json();
    
    if (!quote || !quote.outAmount) {
      console.error("[TradeGuard] Jupiter returned no route");
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
    return null;
  }
}

/**
 * Main validation function - call this BEFORE executing any buy
 * Returns validation result with clear block reasons if trade should not proceed
 */
export async function validateBuyQuote(
  tokenMint: string,
  solAmount: number,
  displayPriceUsd: number,
  config: Partial<TradeGuardConfig> = {}
): Promise<QuoteValidation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
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
  
  const solAmountLamports = Math.floor(solAmount * 1e9);
  const quote = await getExecutableQuote(tokenMint, solAmountLamports, 100);
  
  if (!quote) {
    // CRITICAL FIX: Fail CLOSED - if we can't verify the quote is safe, DON'T trade
    // This prevents buying at unknown/bad prices when Jupiter is unreachable
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
  
  const executablePrice = quote.impliedPriceUsd;
  const tokensDecimal = quote.outputAmount / Math.pow(10, quote.outputDecimals);
  
  // Calculate premium: how much more expensive is executable vs display
  const premiumPct = displayPriceUsd > 0 
    ? ((executablePrice - displayPriceUsd) / displayPriceUsd) * 100
    : 0;
  
  console.log(`[TradeGuard] Price comparison:`);
  console.log(`  Display price:     $${displayPriceUsd.toFixed(10)}`);
  console.log(`  Executable price:  $${executablePrice.toFixed(10)}`);
  console.log(`  Premium:           ${premiumPct.toFixed(2)}% (max: ${cfg.maxPricePremiumPct}%)`);
  console.log(`  Price impact:      ${quote.priceImpactPct.toFixed(2)}% (max: ${cfg.maxPriceImpactPct}%)`);
  
  const result: QuoteValidation = {
    isValid: true,
    displayPrice: displayPriceUsd,
    executablePrice,
    premiumPct,
    priceImpactPct: quote.priceImpactPct,
    outputTokens: tokensDecimal,
    solPrice: quote.solPrice,
    jupiterQuote: quote.quoteResponse,
  };
  
  // Check price premium
  if (premiumPct > cfg.maxPricePremiumPct) {
    result.isValid = false;
    result.blockReason = `PRICE_PREMIUM_EXCEEDED: Executable price is ${premiumPct.toFixed(1)}% above display price (max: ${cfg.maxPricePremiumPct}%). This usually means thin liquidity or fast price movement.`;
    console.error(`[TradeGuard] ❌ BLOCKED: ${result.blockReason}`);
    return result;
  }
  
  // Check price impact
  if (cfg.blockOnHighPriceImpact && quote.priceImpactPct > cfg.maxPriceImpactPct) {
    result.isValid = false;
    result.blockReason = `PRICE_IMPACT_TOO_HIGH: Jupiter reports ${quote.priceImpactPct.toFixed(1)}% price impact (max: ${cfg.maxPriceImpactPct}%). Consider a smaller buy size.`;
    console.error(`[TradeGuard] ❌ BLOCKED: ${result.blockReason}`);
    return result;
  }
  
  console.log(`[TradeGuard] ✅ PASSED: Price validation OK`);
  return result;
}

/**
 * Fetch trade guard config from database, or use defaults
 */
export async function getTradeGuardConfig(supabase: any): Promise<TradeGuardConfig> {
  try {
    const { data } = await supabase
      .from("flipit_settings")
      .select("max_price_premium_pct, require_quote_check, block_on_high_price_impact, max_price_impact_pct")
      .single();
    
    if (data) {
      return {
        maxPricePremiumPct: data.max_price_premium_pct ?? DEFAULT_CONFIG.maxPricePremiumPct,
        requireQuoteCheck: data.require_quote_check ?? DEFAULT_CONFIG.requireQuoteCheck,
        blockOnHighPriceImpact: data.block_on_high_price_impact ?? DEFAULT_CONFIG.blockOnHighPriceImpact,
        maxPriceImpactPct: data.max_price_impact_pct ?? DEFAULT_CONFIG.maxPriceImpactPct,
      };
    }
  } catch (e) {
    console.log("[TradeGuard] No custom config found, using defaults");
  }
  
  return DEFAULT_CONFIG;
}
