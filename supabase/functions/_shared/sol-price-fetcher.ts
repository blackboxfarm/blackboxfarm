/**
 * Shared SOL Price Fetcher - CoinGecko with Fallbacks & Alerts
 * Uses the unified CoinGecko helper with automatic Jupiter/DexScreener fallback.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSolPriceWithFallback, getCoinGeckoConfig, PriceResult } from "./coingecko.ts";

interface PriceFetchResult {
  success: boolean;
  price: number | null;
  source: string;
  responseTimeMs: number;
  error?: string;
  errorType?: string;
  httpStatus?: number;
  isFallback?: boolean;
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
 * Get SOL price with fallback support and logging
 * Tries CoinGecko first, then Jupiter, then DexScreener
 */
export async function getSolPriceWithLogging(context = 'sol-price-fetcher'): Promise<{ 
  price: number; 
  source: string; 
  attempts: PriceFetchResult[];
  isFallback: boolean;
}> {
  const startTime = Date.now();
  const config = getCoinGeckoConfig();
  const attempts: PriceFetchResult[] = [];
  
  try {
    // Use the fallback-aware price getter
    const result: PriceResult = await getSolPriceWithFallback(context);
    const responseTimeMs = Date.now() - startTime;
    
    // Determine source name for logging
    const sourceName = result.source === 'coingecko' 
      ? `coingecko_${config.tier}` 
      : result.source;
    
    const fetchResult: PriceFetchResult = {
      success: true,
      price: result.price,
      source: sourceName,
      responseTimeMs,
      isFallback: result.isFallback,
    };
    
    attempts.push(fetchResult);
    
    // Log the successful attempt (fire and forget)
    logFetchAttempt(fetchResult);
    
    if (result.isFallback) {
      console.log(`[SOL Price] ⚠️ Fallback ${result.source} returned $${result.price.toFixed(2)} in ${responseTimeMs}ms`);
    } else {
      console.log(`[SOL Price] ✓ CoinGecko (${config.tier}) returned $${result.price.toFixed(2)} in ${responseTimeMs}ms`);
    }
    
    return { 
      price: result.price, 
      source: sourceName, 
      attempts,
      isFallback: result.isFallback,
    };
    
  } catch (e) {
    const responseTimeMs = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    const errorType = error.includes('timeout') ? 'timeout' : 
                      error.includes('DNS') ? 'dns_error' :
                      error.includes('network') ? 'network_error' : 
                      error.includes('429') ? 'rate_limit' :
                      error.includes('401') ? 'auth_failed' :
                      error.includes('All') ? 'all_sources_failed' : 'unknown';
    
    const failedResult: PriceFetchResult = {
      success: false,
      price: null,
      source: `coingecko_${config.tier}`,
      responseTimeMs,
      error,
      errorType,
    };
    
    attempts.push(failedResult);
    logFetchAttempt(failedResult);
    
    console.error(`[SOL Price] ✗ All sources failed: ${error} (${responseTimeMs}ms)`);
    
    throw new Error(`SOL price fetch failed (all sources): ${error}`);
  }
}

/**
 * Simple getter that just returns the price (for backward compat)
 */
export async function getSolPrice(context = 'getSolPrice'): Promise<number> {
  const result = await getSolPriceWithLogging(context);
  return result.price;
}

/**
 * Quick price check without logging (for high-frequency calls)
 */
export async function getSolPriceQuick(): Promise<number> {
  const result = await getSolPriceWithFallback('quick-check');
  return result.price;
}
