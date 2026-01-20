/**
 * Shared SOL Price Fetcher - CoinGecko with API Key Authentication
 * Uses the unified CoinGecko helper for authenticated requests.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSolPrice as getCGSolPrice, getCoinGeckoConfig } from "./coingecko.ts";

interface PriceFetchResult {
  success: boolean;
  price: number | null;
  source: string;
  responseTimeMs: number;
  error?: string;
  errorType?: string;
  httpStatus?: number;
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
 * Get SOL price from CoinGecko with authenticated API
 * Returns price or throws if it fails
 */
export async function getSolPriceWithLogging(): Promise<{ price: number; source: string; attempts: PriceFetchResult[] }> {
  const startTime = Date.now();
  const config = getCoinGeckoConfig();
  const source = `coingecko_${config.tier}`;
  
  try {
    const price = await getCGSolPrice();
    const responseTimeMs = Date.now() - startTime;
    
    const result: PriceFetchResult = {
      success: true,
      price,
      source,
      responseTimeMs,
    };
    
    // Log success (fire and forget)
    logFetchAttempt(result);
    
    console.log(`[SOL Price] ✓ CoinGecko (${config.tier}) returned $${price.toFixed(2)} in ${responseTimeMs}ms`);
    return { price, source, attempts: [result] };
    
  } catch (e) {
    const responseTimeMs = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    const errorType = error.includes('timeout') ? 'timeout' : 
                      error.includes('DNS') ? 'dns_error' :
                      error.includes('network') ? 'network_error' : 
                      error.includes('429') ? 'rate_limit' : 'unknown';
    
    const result: PriceFetchResult = {
      success: false,
      price: null,
      source,
      responseTimeMs,
      error,
      errorType,
    };
    
    logFetchAttempt(result);
    console.error(`[SOL Price] ✗ CoinGecko (${config.tier}) failed: ${error} (${responseTimeMs}ms)`);
    
    throw new Error(`CoinGecko SOL price failed: ${error}`);
  }
}

/**
 * Simple getter that just returns the price (for backward compat)
 */
export async function getSolPrice(): Promise<number> {
  const result = await getSolPriceWithLogging();
  return result.price;
}
