/**
 * HISTORICAL PRICE FETCHER - Stale Alpha Protection
 * 
 * Multi-tier approach to fetch token price at a specific historical timestamp:
 * 1. GeckoTerminal OHLCV minute candles (graduated tokens on DEX)
 * 2. pump.fun trade history (on-curve pump.fun tokens)
 * 3. DexScreener h1 price change interpolation (fallback)
 */

export interface HistoricalPriceResult {
  price: number | null;
  source: 'geckoterminal' | 'pumpfun_trades' | 'dexscreener_interpolated' | 'current_fallback' | 'unavailable';
  confidence: 'high' | 'medium' | 'low';
  ageSeconds: number;
  error?: string;
}

// ============================================
// GECKOTERMINAL MINUTE CANDLES
// ============================================

async function tryGeckoTerminalMinute(
  tokenMint: string,
  targetTimestamp: Date
): Promise<{ price: number; source: 'geckoterminal' } | null> {
  try {
    // GeckoTerminal requires pool address, so we first need to find it
    // Use their token endpoint to find the Solana pool
    const tokenResponse = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!tokenResponse.ok) return null;
    
    const tokenData = await tokenResponse.json();
    const topPool = tokenData?.data?.relationships?.top_pools?.data?.[0]?.id;
    
    if (!topPool) return null;
    
    // Extract pool address from the relationship ID (format: "solana_POOLADDRESS")
    const poolAddress = topPool.replace('solana_', '');
    
    // Now fetch OHLCV data with 1-minute resolution
    const now = Math.floor(Date.now() / 1000);
    const targetTime = Math.floor(targetTimestamp.getTime() / 1000);
    const ageSeconds = now - targetTime;
    
    // GeckoTerminal allows historical candles up to a limit
    // Use aggregate=1 for 1-minute candles
    const ohlcvResponse = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=1&limit=60&before_timestamp=${now}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!ohlcvResponse.ok) return null;
    
    const ohlcvData = await ohlcvResponse.json();
    const candles = ohlcvData?.data?.attributes?.ohlcv_list;
    
    if (!candles || candles.length === 0) return null;
    
    // Find the candle closest to our target timestamp
    // Candle format: [timestamp, open, high, low, close, volume]
    let closestCandle: any = null;
    let closestDiff = Infinity;
    
    for (const candle of candles) {
      const candleTime = candle[0];
      const diff = Math.abs(candleTime - targetTime);
      
      if (diff < closestDiff) {
        closestDiff = diff;
        closestCandle = candle;
      }
    }
    
    // Only use if within 2 minutes of target
    if (closestCandle && closestDiff < 120) {
      const closePrice = parseFloat(closestCandle[4]); // Use close price
      if (closePrice > 0) {
        console.log(`[historical-price] GeckoTerminal: Found price $${closePrice} at ${closestDiff}s from target`);
        return { price: closePrice, source: 'geckoterminal' };
      }
    }
    
    return null;
  } catch (error: any) {
    console.log(`[historical-price] GeckoTerminal failed: ${error?.message?.slice(0, 100)}`);
    return null;
  }
}

// ============================================
// PUMP.FUN TRADE HISTORY
// ============================================

async function tryPumpFunTradeHistory(
  tokenMint: string,
  targetTimestamp: Date
): Promise<{ price: number; source: 'pumpfun_trades' } | null> {
  try {
    // pump.fun API returns recent trades for a token
    const response = await fetch(
      `https://frontend-api.pump.fun/trades/latest/${tokenMint}?limit=100`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!response.ok) return null;
    
    const trades = await response.json();
    
    if (!Array.isArray(trades) || trades.length === 0) return null;
    
    const targetTime = targetTimestamp.getTime();
    
    // Find trades closest to our target timestamp
    let closestTrade: any = null;
    let closestDiff = Infinity;
    
    for (const trade of trades) {
      // Trade has timestamp field (could be 'timestamp' or 'slot_timestamp' or 'created_timestamp')
      const tradeTime = trade.timestamp 
        ? new Date(trade.timestamp).getTime()
        : trade.slot_timestamp 
          ? trade.slot_timestamp * 1000
          : null;
      
      if (!tradeTime) continue;
      
      const diff = Math.abs(tradeTime - targetTime);
      
      if (diff < closestDiff) {
        closestDiff = diff;
        closestTrade = trade;
      }
    }
    
    // Only use if within 2 minutes of target
    if (closestTrade && closestDiff < 120000) {
      // Calculate price from trade
      // Trade usually has sol_amount and token_amount
      const solAmount = closestTrade.sol_amount || closestTrade.amount_sol;
      const tokenAmount = closestTrade.token_amount || closestTrade.amount_tokens;
      
      if (solAmount && tokenAmount && tokenAmount > 0) {
        // Need SOL price to convert to USD
        const solPriceUsd = await fetchSolPriceSimple();
        const pricePerToken = (solAmount / 1e9) / (tokenAmount / 1e6); // SOL in lamports, token in 6 decimals
        const priceUsd = pricePerToken * solPriceUsd;
        
        if (priceUsd > 0 && priceUsd < 1000) { // Sanity check
          console.log(`[historical-price] pump.fun trades: Found price $${priceUsd.toFixed(10)} at ${Math.round(closestDiff/1000)}s from target`);
          return { price: priceUsd, source: 'pumpfun_trades' };
        }
      }
    }
    
    return null;
  } catch (error: any) {
    console.log(`[historical-price] pump.fun trades failed: ${error?.message?.slice(0, 100)}`);
    return null;
  }
}

// ============================================
// DEXSCREENER INTERPOLATION (FALLBACK)
// ============================================

async function tryDexScreenerInterpolation(
  tokenMint: string,
  targetTimestamp: Date,
  currentPrice: number
): Promise<{ price: number; source: 'dexscreener_interpolated' } | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const pair = data?.pairs?.[0];
    
    if (!pair) return null;
    
    const priceChange5m = pair.priceChange?.m5;
    const priceChange1h = pair.priceChange?.h1;
    
    const now = Date.now();
    const targetTime = targetTimestamp.getTime();
    const ageMs = now - targetTime;
    const ageMinutes = ageMs / 60000;
    
    // Use appropriate price change window
    let priceChange: number | null = null;
    
    if (ageMinutes <= 5 && priceChange5m !== undefined) {
      // For messages in the last 5 minutes, use 5m change proportionally
      const proportion = ageMinutes / 5;
      priceChange = (priceChange5m || 0) * proportion;
    } else if (ageMinutes <= 60 && priceChange1h !== undefined) {
      // For messages in the last hour, use h1 change proportionally
      const proportion = ageMinutes / 60;
      priceChange = (priceChange1h || 0) * proportion;
    }
    
    if (priceChange !== null && currentPrice > 0) {
      // Calculate estimated historical price
      // If current price is X and it changed by Y%, then historical = X / (1 + Y/100)
      const estimatedHistoricalPrice = currentPrice / (1 + priceChange / 100);
      
      console.log(`[historical-price] DexScreener interpolation: Est. price $${estimatedHistoricalPrice.toFixed(10)} (${ageMinutes.toFixed(1)}min ago, ${priceChange.toFixed(1)}% change)`);
      return { price: estimatedHistoricalPrice, source: 'dexscreener_interpolated' };
    }
    
    return null;
  } catch (error: any) {
    console.log(`[historical-price] DexScreener interpolation failed: ${error?.message?.slice(0, 100)}`);
    return null;
  }
}

// ============================================
// SIMPLE SOL PRICE FETCH
// ============================================

async function fetchSolPriceSimple(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112',
      { signal: AbortSignal.timeout(3000) }
    );
    if (response.ok) {
      const data = await response.json();
      const price = data?.data?.['So11111111111111111111111111111111111111112']?.price;
      if (price) return parseFloat(price);
    }
  } catch {}
  return 180; // Fallback
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Fetch the historical price of a token at a specific timestamp.
 * 
 * @param tokenMint - The token's mint address
 * @param targetTimestamp - The timestamp to fetch price for (message post time)
 * @param currentPrice - The current token price (for fallback calculations)
 * @returns HistoricalPriceResult with price, source, and confidence
 */
export async function fetchPriceAtTimestamp(
  tokenMint: string,
  targetTimestamp: Date,
  currentPrice?: number
): Promise<HistoricalPriceResult> {
  const now = Date.now();
  const ageSeconds = Math.round((now - targetTimestamp.getTime()) / 1000);
  
  // For very recent messages (< 5 seconds), current price is fine
  if (ageSeconds < 5) {
    return {
      price: currentPrice || null,
      source: 'current_fallback',
      confidence: 'high',
      ageSeconds
    };
  }
  
  // For messages too old (> 10 minutes), we can't reliably reconstruct
  if (ageSeconds > 600) {
    console.log(`[historical-price] Message too old (${ageSeconds}s), using current as fallback`);
    return {
      price: currentPrice || null,
      source: 'current_fallback',
      confidence: 'low',
      ageSeconds,
      error: 'Message older than 10 minutes, historical price unreliable'
    };
  }
  
  console.log(`[historical-price] Fetching historical price for ${tokenMint} at ${ageSeconds}s ago`);
  
  // Tier 1: Try GeckoTerminal minute candles (best for graduated tokens)
  const geckoResult = await tryGeckoTerminalMinute(tokenMint, targetTimestamp);
  if (geckoResult) {
    return {
      price: geckoResult.price,
      source: 'geckoterminal',
      confidence: 'high',
      ageSeconds
    };
  }
  
  // Tier 2: Try pump.fun trade history (best for on-curve tokens)
  const pumpResult = await tryPumpFunTradeHistory(tokenMint, targetTimestamp);
  if (pumpResult) {
    return {
      price: pumpResult.price,
      source: 'pumpfun_trades',
      confidence: 'high',
      ageSeconds
    };
  }
  
  // Tier 3: DexScreener interpolation (fallback)
  if (currentPrice && currentPrice > 0) {
    const dexResult = await tryDexScreenerInterpolation(tokenMint, targetTimestamp, currentPrice);
    if (dexResult) {
      return {
        price: dexResult.price,
        source: 'dexscreener_interpolated',
        confidence: 'medium',
        ageSeconds
      };
    }
  }
  
  // Final fallback: use current price with low confidence
  if (currentPrice && currentPrice > 0) {
    console.log(`[historical-price] All sources failed, using current price as fallback`);
    return {
      price: currentPrice,
      source: 'current_fallback',
      confidence: 'low',
      ageSeconds,
      error: 'Could not fetch historical price from any source'
    };
  }
  
  return {
    price: null,
    source: 'unavailable',
    confidence: 'low',
    ageSeconds,
    error: 'No historical price available'
  };
}

/**
 * Validate if a buy should proceed based on stale alpha protection.
 * 
 * @param tokenMint - Token mint address
 * @param messageTimestamp - When the Telegram message was posted
 * @param currentPrice - Current token price in USD
 * @param config - Stale alpha protection settings
 * @returns Object with passed/blocked status and details
 */
export async function validateStaleAlpha(
  tokenMint: string,
  messageTimestamp: Date,
  currentPrice: number,
  config: {
    enabled: boolean;
    dropThresholdPct: number;
    minAgeSeconds: number;
  }
): Promise<{
  passed: boolean;
  priceAtMessage: number | null;
  priceDropPct: number | null;
  source: string;
  confidence: string;
  blockReason?: string;
}> {
  // If disabled, always pass
  if (!config.enabled) {
    return {
      passed: true,
      priceAtMessage: null,
      priceDropPct: null,
      source: 'disabled',
      confidence: 'high'
    };
  }
  
  const ageSeconds = Math.round((Date.now() - messageTimestamp.getTime()) / 1000);
  
  // Skip check for very fresh messages
  if (ageSeconds < config.minAgeSeconds) {
    console.log(`[stale-alpha] Message is ${ageSeconds}s old (< ${config.minAgeSeconds}s threshold), skipping check`);
    return {
      passed: true,
      priceAtMessage: null,
      priceDropPct: null,
      source: 'too_fresh',
      confidence: 'high'
    };
  }
  
  // Fetch historical price
  const historicalResult = await fetchPriceAtTimestamp(tokenMint, messageTimestamp, currentPrice);
  
  if (!historicalResult.price || historicalResult.price <= 0) {
    // Can't validate - default to pass with warning
    console.log(`[stale-alpha] Could not fetch historical price, allowing buy with warning`);
    return {
      passed: true,
      priceAtMessage: null,
      priceDropPct: null,
      source: historicalResult.source,
      confidence: 'low'
    };
  }
  
  // Calculate price drop
  const priceDrop = historicalResult.price - currentPrice;
  const priceDropPct = (priceDrop / historicalResult.price) * 100;
  
  console.log(`[stale-alpha] Price at message: $${historicalResult.price.toFixed(10)} (${historicalResult.source})`);
  console.log(`[stale-alpha] Current price: $${currentPrice.toFixed(10)}`);
  console.log(`[stale-alpha] Price change: ${priceDropPct > 0 ? '-' : '+'}${Math.abs(priceDropPct).toFixed(1)}%`);
  
  // Check if drop exceeds threshold
  if (priceDropPct > config.dropThresholdPct) {
    const blockReason = `Stale alpha: Price dropped ${priceDropPct.toFixed(0)}% since call (threshold: ${config.dropThresholdPct}%)`;
    console.log(`[stale-alpha] ❌ BLOCKED: ${blockReason}`);
    
    return {
      passed: false,
      priceAtMessage: historicalResult.price,
      priceDropPct,
      source: historicalResult.source,
      confidence: historicalResult.confidence,
      blockReason
    };
  }
  
  console.log(`[stale-alpha] ✅ PASSED: Price change within threshold`);
  
  return {
    passed: true,
    priceAtMessage: historicalResult.price,
    priceDropPct,
    source: historicalResult.source,
    confidence: historicalResult.confidence
  };
}
