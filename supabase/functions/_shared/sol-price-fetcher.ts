/**
 * Shared SOL Price Fetcher with detailed logging and analytics
 * 
 * Priority order (fastest & most reliable first):
 * 1. Jupiter v6 - fastest, Solana-native, no rate limits
 * 2. Binance - extremely fast, highly reliable, minimal rate limits
 * 3. CoinGecko - reliable but can rate limit
 * 4. Kraken - solid backup
 * 5. DexScreener - slowest but always works
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface PriceFetchResult {
  success: boolean;
  price: number | null;
  source: string;
  responseTimeMs: number;
  error?: string;
  errorType?: string;
  httpStatus?: number;
}

interface SourceConfig {
  name: string;
  fetch: () => Promise<number>;
  timeout: number;
}

/**
 * Log a fetch attempt to the database for analytics
 */
async function logFetchAttempt(result: PriceFetchResult): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) return;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    await supabase.from('sol_price_fetch_logs').insert({
      source_name: result.source,
      success: result.success,
      price_fetched: result.price,
      response_time_ms: result.responseTimeMs,
      error_message: result.error || null,
      error_type: result.errorType || null,
      http_status: result.httpStatus || null,
    });
  } catch (e) {
    // Don't let logging failures break price fetching
    console.log('[SOL Price] Failed to log fetch attempt:', e);
  }
}

/**
 * Fetch with timeout and detailed error tracking
 */
async function fetchWithTracking(
  name: string,
  url: string,
  extractor: (json: unknown) => number,
  timeout: number = 3000
): Promise<PriceFetchResult> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const responseTimeMs = Date.now() - startTime;
    
    if (!res.ok) {
      return {
        success: false,
        price: null,
        source: name,
        responseTimeMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
        errorType: 'http_error',
        httpStatus: res.status,
      };
    }
    
    const json = await res.json();
    const price = extractor(json);
    
    if (!price || !isFinite(price) || price <= 0) {
      return {
        success: false,
        price: null,
        source: name,
        responseTimeMs,
        error: `Invalid price extracted: ${price}`,
        errorType: 'invalid_price',
      };
    }
    
    return {
      success: true,
      price,
      source: name,
      responseTimeMs,
    };
  } catch (e) {
    const responseTimeMs = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    const errorType = error.includes('abort') ? 'timeout' : 
                      error.includes('DNS') ? 'dns_error' :
                      error.includes('network') ? 'network_error' : 'unknown';
    
    return {
      success: false,
      price: null,
      source: name,
      responseTimeMs,
      error,
      errorType,
    };
  }
}

/**
 * Get SOL price with priority ordering and detailed logging
 * Returns price or throws if ALL sources fail
 */
export async function getSolPriceWithLogging(): Promise<{ price: number; source: string; attempts: PriceFetchResult[] }> {
  const attempts: PriceFetchResult[] = [];
  
  // Priority order: fastest & most reliable first
  const sources: Array<{ name: string; url: string; extractor: (json: unknown) => number; timeout: number }> = [
    {
      name: 'jupiter_v6',
      url: `https://price.jup.ag/v6/price?ids=${SOL_MINT}`,
      extractor: (json: unknown) => Number((json as Record<string, unknown>)?.data?.[SOL_MINT]?.price),
      timeout: 3000,
    },
    {
      name: 'binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      extractor: (json: unknown) => Number((json as Record<string, unknown>)?.price),
      timeout: 2000, // Binance is very fast
    },
    {
      name: 'coingecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      extractor: (json: unknown) => Number((json as Record<string, unknown>)?.solana?.usd),
      timeout: 4000, // CoinGecko can be slower
    },
    {
      name: 'kraken',
      url: 'https://api.kraken.com/0/public/Ticker?pair=SOLUSD',
      extractor: (json: unknown) => Number((json as Record<string, unknown>)?.result?.SOLUSD?.c?.[0]),
      timeout: 4000,
    },
    {
      name: 'dexscreener',
      url: `https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`,
      extractor: (json: unknown) => Number((json as Record<string, unknown>)?.pairs?.[0]?.priceUsd),
      timeout: 5000, // DexScreener can be slowest
    },
  ];
  
  for (const source of sources) {
    console.log(`[SOL Price] Trying ${source.name}...`);
    
    const result = await fetchWithTracking(source.name, source.url, source.extractor, source.timeout);
    attempts.push(result);
    
    // Log to database (fire and forget)
    logFetchAttempt(result);
    
    if (result.success && result.price) {
      console.log(`[SOL Price] ✓ ${source.name} returned $${result.price.toFixed(2)} in ${result.responseTimeMs}ms`);
      return { price: result.price, source: source.name, attempts };
    }
    
    console.log(`[SOL Price] ✗ ${source.name} failed: ${result.error} (${result.responseTimeMs}ms)`);
  }
  
  // ALL sources failed - log detailed report
  console.error('[SOL Price] CRITICAL: All 5 sources failed!');
  console.error('[SOL Price] Failure Report:');
  for (const attempt of attempts) {
    console.error(`  - ${attempt.source}: ${attempt.errorType} - ${attempt.error} (${attempt.responseTimeMs}ms)`);
  }
  
  throw new Error(`All 5 SOL price sources failed: ${attempts.map(a => `${a.source}:${a.errorType}`).join(', ')}`);
}

/**
 * Simple getter that just returns the price (for backward compat)
 */
export async function getSolPrice(): Promise<number> {
  const result = await getSolPriceWithLogging();
  return result.price;
}
