/**
 * Unified CoinGecko API Helper with Error Handling & Fallbacks
 * Supports Demo and Pro tiers with automatic authentication
 * 
 * Demo tier: 10k calls/month, 30 req/min, 60s freshness
 * Basic tier: 100k calls/month, 250 req/min, 10s freshness
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  classifyCoinGeckoError, 
  parseResponseError, 
  shouldUseFallback,
  formatErrorForLog 
} from "./coingecko-error-handler.ts";
import type { CoinGeckoErrorInfo } from "./coingecko-error-handler.ts";
import { sendCoinGeckoAlert, logFallbackActivation } from "./coingecko-alerts.ts";

export interface CoinGeckoConfig {
  baseUrl: string;
  headers: Record<string, string>;
  tier: 'pro' | 'demo' | 'free';
}

export interface PriceResult {
  price: number;
  source: 'coingecko' | 'jupiter' | 'dexscreener';
  isFallback: boolean;
  errorInfo?: CoinGeckoErrorInfo;
}

// Re-export for convenience
export type { CoinGeckoErrorInfo };
export { classifyCoinGeckoError };

/**
 * Get CoinGecko API configuration based on environment
 */
export function getCoinGeckoConfig(): CoinGeckoConfig {
  const apiKey = Deno.env.get('COINGECKO_API_KEY');
  
  // Pro keys start with CG- and don't contain 'demo'
  // Demo keys also start with CG- but we'll use demo endpoint to be safe
  const isPro = apiKey && apiKey.startsWith('CG-') && apiKey.length > 20;
  
  // For now, always use demo endpoint unless explicitly configured
  // When upgrading to Basic/Pro, this can be changed
  const useProEndpoint = isPro && Deno.env.get('COINGECKO_USE_PRO') === 'true';
  
  return {
    baseUrl: useProEndpoint 
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3',
    headers: apiKey ? {
      'x-cg-demo-api-key': apiKey,
      'Accept': 'application/json',
    } : {
      'Accept': 'application/json',
    },
    tier: useProEndpoint ? 'pro' : (apiKey ? 'demo' : 'free'),
  };
}

/**
 * Get Supabase client for alerts (lazy initialization)
 */
function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) return null;
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fetch data from CoinGecko API with enhanced error handling
 */
export async function fetchCoinGecko<T = any>(
  endpoint: string, 
  timeout = 5000
): Promise<T> {
  const config = getCoinGeckoConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const url = `${config.baseUrl}${endpoint}`;
  console.log(`[CoinGecko] Fetching ${endpoint} (tier: ${config.tier})`);
  
  try {
    const response = await fetch(url, {
      headers: config.headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Parse response error with detailed info
      const errorInfo = parseResponseError(response, endpoint, config.tier);
      console.error(formatErrorForLog(errorInfo));
      
      // Attach error info to the error for upstream handling
      const error = new Error(`CoinGecko ${config.tier}: HTTP ${response.status}`);
      (error as any).errorInfo = errorInfo;
      throw error;
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    // If already classified (from !response.ok), re-throw
    if ((error as any).errorInfo) {
      throw error;
    }
    
    // Classify the error
    const errorInfo = classifyCoinGeckoError(
      error instanceof Error ? error : String(error),
      { endpoint, tier: config.tier }
    );
    console.error(formatErrorForLog(errorInfo));
    
    const wrappedError = new Error(errorInfo.message);
    (wrappedError as any).errorInfo = errorInfo;
    throw wrappedError;
  }
}

// ============= FALLBACK PRICE SOURCES =============

/**
 * Fetch SOL price from Jupiter API with auth
 */
async function fetchJupiterSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  
  try {
    const response = await fetch(
      'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112',
      { 
        signal: controller.signal,
        headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
      }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter API returned ${response.status}`);
    }
    
    const data = await response.json();
    const price = data?.data?.['So11111111111111111111111111111111111111112']?.price;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid SOL price from Jupiter');
    }
    
    console.log(`[Jupiter Fallback] ✓ SOL price: $${price.toFixed(2)}`);
    return price;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[Jupiter Fallback] ✗ Failed:', e);
    throw e;
  }
}

/**
 * Fetch SOL price from DexScreener (SOL/USDC pair on Raydium)
 */
async function fetchDexScreenerSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    // SOL/USDC pair on Raydium
    const response = await fetch(
      'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener API returned ${response.status}`);
    }
    
    const data = await response.json();
    // Find a high-liquidity pair
    const pairs = data?.pairs || [];
    const usdcPair = pairs.find((p: any) => 
      p.quoteToken?.symbol === 'USDC' && p.liquidity?.usd > 100000
    );
    
    const price = usdcPair?.priceUsd ? parseFloat(usdcPair.priceUsd) : null;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid SOL price from DexScreener');
    }
    
    console.log(`[DexScreener Fallback] ✓ SOL price: $${price.toFixed(2)}`);
    return price;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[DexScreener Fallback] ✗ Failed:', e);
    throw e;
  }
}

/**
 * Fetch ETH price from a fallback source
 */
async function fetchFallbackEthPrice(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    // Use DexScreener for ETH on mainnet
    const response = await fetch(
      'https://api.dexscreener.com/latest/dex/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener ETH API returned ${response.status}`);
    }
    
    const data = await response.json();
    const pairs = data?.pairs || [];
    const usdPair = pairs.find((p: any) => 
      (p.quoteToken?.symbol === 'USDC' || p.quoteToken?.symbol === 'USDT') && 
      p.liquidity?.usd > 1000000
    );
    
    const price = usdPair?.priceUsd ? parseFloat(usdPair.priceUsd) : null;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid ETH price from DexScreener');
    }
    
    console.log(`[DexScreener Fallback] ✓ ETH price: $${price.toFixed(2)}`);
    return price;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[DexScreener Fallback] ✗ ETH Failed:', e);
    throw e;
  }
}

// ============= PRIMARY API FUNCTIONS =============

/**
 * Get SOL price in USD (primary CoinGecko function)
 */
export async function getSolPrice(): Promise<number> {
  const data = await fetchCoinGecko<{ solana?: { usd?: number } }>(
    '/simple/price?ids=solana&vs_currencies=usd'
  );
  const price = data?.solana?.usd;
  if (!price || typeof price !== 'number' || price <= 0) {
    throw new Error('Invalid SOL price from CoinGecko');
  }
  return price;
}

/**
 * Get ETH price in USD
 */
export async function getEthPrice(): Promise<number> {
  const data = await fetchCoinGecko<{ ethereum?: { usd?: number } }>(
    '/simple/price?ids=ethereum&vs_currencies=usd'
  );
  const price = data?.ethereum?.usd;
  if (!price || typeof price !== 'number' || price <= 0) {
    throw new Error('Invalid ETH price from CoinGecko');
  }
  return price;
}

/**
 * Get multiple token prices by CoinGecko IDs
 */
export async function getTokenPrices(
  ids: string[]
): Promise<Record<string, { usd: number }>> {
  const data = await fetchCoinGecko<Record<string, { usd?: number }>>(
    `/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  );
  return data;
}

/**
 * Get token price by Solana contract address
 */
export async function getTokenPriceByContract(
  contractAddress: string
): Promise<number> {
  const data = await fetchCoinGecko<Record<string, { usd?: number }>>(
    `/simple/token_price/solana?contract_addresses=${contractAddress}&vs_currencies=usd`
  );
  return data?.[contractAddress.toLowerCase()]?.usd || 0;
}

// ============= FALLBACK-AWARE FUNCTIONS =============

/**
 * Get SOL price with automatic fallback to Jupiter/DexScreener
 * This is the recommended function to use in edge functions
 */
export async function getSolPriceWithFallback(context = 'unknown'): Promise<PriceResult> {
  const config = getCoinGeckoConfig();
  const supabase = getSupabaseClient();
  
  // Try CoinGecko first
  try {
    const price = await getSolPrice();
    return { price, source: 'coingecko', isFallback: false };
  } catch (error) {
    const errorInfo: CoinGeckoErrorInfo = (error as any).errorInfo || 
      classifyCoinGeckoError(error instanceof Error ? error : String(error), {
        endpoint: '/simple/price',
        tier: config.tier,
      });
    
    console.warn(`[CoinGecko] Primary failed (${errorInfo.errorCode}), trying fallbacks...`);
    
    // Send alert if configured (fire and forget)
    if (supabase && errorInfo.shouldAlert) {
      sendCoinGeckoAlert(supabase, errorInfo, context).catch(e => 
        console.warn('[CoinGecko] Alert failed:', e)
      );
    }
    
    // Fallback 1: Jupiter
    try {
      const jupiterPrice = await fetchJupiterSolPrice();
      
      // Log fallback activation
      if (supabase) {
        logFallbackActivation(supabase, errorInfo, 'jupiter', jupiterPrice, context).catch(() => {});
      }
      
      return { 
        price: jupiterPrice, 
        source: 'jupiter', 
        isFallback: true,
        errorInfo,
      };
    } catch (jupError) {
      console.warn('[Jupiter Fallback] Failed, trying DexScreener...');
    }
    
    // Fallback 2: DexScreener
    try {
      const dexPrice = await fetchDexScreenerSolPrice();
      
      // Log fallback activation
      if (supabase) {
        logFallbackActivation(supabase, errorInfo, 'dexscreener', dexPrice, context).catch(() => {});
      }
      
      return { 
        price: dexPrice, 
        source: 'dexscreener', 
        isFallback: true,
        errorInfo,
      };
    } catch (dexError) {
      // All sources failed
      console.error('[Price] CRITICAL: All SOL price sources failed!');
      throw new Error(`All SOL price sources failed. CoinGecko: ${errorInfo.message}`);
    }
  }
}

/**
 * Get ETH price with automatic fallback
 */
export async function getEthPriceWithFallback(context = 'unknown'): Promise<PriceResult> {
  const config = getCoinGeckoConfig();
  const supabase = getSupabaseClient();
  
  // Try CoinGecko first
  try {
    const price = await getEthPrice();
    return { price, source: 'coingecko', isFallback: false };
  } catch (error) {
    const errorInfo: CoinGeckoErrorInfo = (error as any).errorInfo || 
      classifyCoinGeckoError(error instanceof Error ? error : String(error), {
        endpoint: '/simple/price',
        tier: config.tier,
      });
    
    console.warn(`[CoinGecko] ETH price failed (${errorInfo.errorCode}), trying fallback...`);
    
    // Send alert if configured
    if (supabase && errorInfo.shouldAlert) {
      sendCoinGeckoAlert(supabase, errorInfo, context).catch(e => 
        console.warn('[CoinGecko] Alert failed:', e)
      );
    }
    
    // Fallback: DexScreener
    try {
      const dexPrice = await fetchFallbackEthPrice();
      
      if (supabase) {
        logFallbackActivation(supabase, errorInfo, 'dexscreener', dexPrice, context).catch(() => {});
      }
      
      return { 
        price: dexPrice, 
        source: 'dexscreener', 
        isFallback: true,
        errorInfo,
      };
    } catch (dexError) {
      console.error('[Price] CRITICAL: All ETH price sources failed!');
      throw new Error(`All ETH price sources failed. CoinGecko: ${errorInfo.message}`);
    }
  }
}

/**
 * Get SOL price with detailed result for logging (legacy compat)
 */
export async function getSolPriceWithDetails(): Promise<{
  price: number;
  tier: string;
  timestamp: string;
}> {
  const config = getCoinGeckoConfig();
  const price = await getSolPrice();
  return {
    price,
    tier: config.tier,
    timestamp: new Date().toISOString(),
  };
}
