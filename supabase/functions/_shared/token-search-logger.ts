/**
 * Token Search Logger - Captures granular search data for historical analysis
 * Logs to: token_search_log, token_search_results, token_socials_history, 
 *          token_dex_status_history, token_price_history
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SearchLogParams {
  tokenMint: string;
  sessionId?: string;
  visitorFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SearchResultParams {
  searchId: string;
  tokenMint: string;
  symbol?: string;
  name?: string;
  marketCapUsd?: number;
  priceUsd?: number;
  priceSource?: string;
  totalSupply?: number;
  circulatingSupply?: number;
  healthScore?: number;
  healthGrade?: string;
  tierDust?: number;
  tierRetail?: number;
  tierSerious?: number;
  tierWhale?: number;
  lpCount?: number;
  lpPercentage?: number;
  top5Concentration?: number;
  top10Concentration?: number;
  top20Concentration?: number;
  riskFlags?: string[];
  bundledPercentage?: number;
  launchpad?: string;
  creatorWallet?: string;
}

export interface SocialsParams {
  tokenMint: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  source?: string;
}

export interface DexStatusParams {
  tokenMint: string;
  hasPaidProfile: boolean;
  hasCto: boolean;
  activeBoosts: number;
  boostAmountTotal?: number;
  hasActiveAds: boolean;
  orders?: Record<string, unknown>;
}

export interface PriceHistoryParams {
  tokenMint: string;
  priceUsd: number;
  marketCapUsd?: number;
  source?: string;
}

/**
 * Get Supabase client for logging (uses service role for inserts)
 */
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseKey) {
    console.warn('[TokenSearchLogger] No Supabase key available');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Extract IP address from request headers
 */
export function extractIpAddress(req: Request): string | undefined {
  // Try various headers that proxies use
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip', // Cloudflare
    'x-client-ip',
    'true-client-ip',
  ];
  
  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      return value.split(',')[0].trim();
    }
  }
  
  return undefined;
}

/**
 * Start a search log entry - call at beginning of request
 * Returns the search ID for linking results
 */
export async function startSearchLog(params: SearchLogParams): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('token_search_log')
      .insert({
        token_mint: params.tokenMint,
        session_id: params.sessionId,
        visitor_fingerprint: params.visitorFingerprint,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        success: true, // Will be updated on error
      })
      .select('id')
      .single();
    
    if (error) {
      console.warn('[TokenSearchLogger] Failed to start search log:', error.message);
      return null;
    }
    
    console.log(`[TokenSearchLogger] Search started: ${data.id}`);
    return data.id;
  } catch (e) {
    console.warn('[TokenSearchLogger] Error starting search log:', e);
    return null;
  }
}

/**
 * Complete a search log entry with timing and holder count
 */
export async function completeSearchLog(
  searchId: string,
  responseTimeMs: number,
  holderCount: number,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !searchId) return;
  
  try {
    await supabase
      .from('token_search_log')
      .update({
        response_time_ms: responseTimeMs,
        holder_count: holderCount,
        success,
        error_message: errorMessage,
      })
      .eq('id', searchId);
    
    console.log(`[TokenSearchLogger] Search completed: ${searchId} (${responseTimeMs}ms, ${holderCount} holders)`);
  } catch (e) {
    console.warn('[TokenSearchLogger] Error completing search log:', e);
  }
}

/**
 * Log complete search results
 */
export async function logSearchResults(params: SearchResultParams): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  try {
    await supabase.from('token_search_results').insert({
      search_id: params.searchId,
      token_mint: params.tokenMint,
      symbol: params.symbol,
      name: params.name,
      market_cap_usd: params.marketCapUsd,
      price_usd: params.priceUsd,
      price_source: params.priceSource,
      total_supply: params.totalSupply,
      circulating_supply: params.circulatingSupply,
      health_score: params.healthScore,
      health_grade: params.healthGrade,
      tier_dust: params.tierDust,
      tier_retail: params.tierRetail,
      tier_serious: params.tierSerious,
      tier_whale: params.tierWhale,
      lp_count: params.lpCount,
      lp_percentage: params.lpPercentage,
      top5_concentration: params.top5Concentration,
      top10_concentration: params.top10Concentration,
      top20_concentration: params.top20Concentration,
      risk_flags: params.riskFlags || [],
      bundled_percentage: params.bundledPercentage,
      launchpad: params.launchpad,
      creator_wallet: params.creatorWallet,
    });
    
    console.log(`[TokenSearchLogger] Results logged for search ${params.searchId}`);
  } catch (e) {
    console.warn('[TokenSearchLogger] Error logging search results:', e);
  }
}

/**
 * Log socials history - only inserts if different from last record
 */
export async function logSocialsHistory(params: SocialsParams): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  // Skip if no socials to log
  if (!params.twitter && !params.telegram && !params.website && !params.discord) {
    return;
  }
  
  try {
    // Use upsert with unique constraint - will only insert if combination is new
    await supabase.from('token_socials_history').upsert({
      token_mint: params.tokenMint,
      twitter: params.twitter || null,
      telegram: params.telegram || null,
      website: params.website || null,
      discord: params.discord || null,
      source: params.source || 'dexscreener',
    }, {
      onConflict: 'token_mint,COALESCE(twitter, \'\'),COALESCE(telegram, \'\'),COALESCE(website, \'\'),COALESCE(discord, \'\')',
      ignoreDuplicates: true,
    });
    
    console.log(`[TokenSearchLogger] Socials logged for ${params.tokenMint}`);
  } catch (e) {
    // Ignore duplicate key errors (expected when socials haven't changed)
    if (!String(e).includes('duplicate') && !String(e).includes('23505')) {
      console.warn('[TokenSearchLogger] Error logging socials:', e);
    }
  }
}

/**
 * Log DEX status history - only inserts if status changed
 */
export async function logDexStatusHistory(params: DexStatusParams): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  try {
    // Use upsert with unique constraint - will only insert if status is new
    await supabase.from('token_dex_status_history').upsert({
      token_mint: params.tokenMint,
      has_paid_profile: params.hasPaidProfile,
      has_cto: params.hasCto,
      active_boosts: params.activeBoosts,
      boost_amount_total: params.boostAmountTotal || 0,
      has_active_ads: params.hasActiveAds,
      orders: params.orders || null,
    }, {
      onConflict: 'token_mint,has_paid_profile,has_cto,active_boosts,has_active_ads',
      ignoreDuplicates: true,
    });
    
    console.log(`[TokenSearchLogger] DEX status logged for ${params.tokenMint}`);
  } catch (e) {
    // Ignore duplicate key errors
    if (!String(e).includes('duplicate') && !String(e).includes('23505')) {
      console.warn('[TokenSearchLogger] Error logging DEX status:', e);
    }
  }
}

/**
 * Log price history
 */
export async function logPriceHistory(params: PriceHistoryParams): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  // Skip if no valid price
  if (!params.priceUsd || params.priceUsd <= 0) {
    return;
  }
  
  try {
    await supabase.from('token_price_history').insert({
      token_mint: params.tokenMint,
      price_usd: params.priceUsd,
      market_cap_usd: params.marketCapUsd,
      source: params.source,
    });
    
    console.log(`[TokenSearchLogger] Price logged: $${params.priceUsd} for ${params.tokenMint.slice(0, 8)}...`);
  } catch (e) {
    console.warn('[TokenSearchLogger] Error logging price:', e);
  }
}

/**
 * Log all search data in parallel - fire and forget
 */
export async function logCompleteSearch(
  searchId: string | null,
  result: {
    tokenMint: string;
    symbol?: string;
    name?: string;
    marketCap?: number;
    tokenPriceUSD?: number;
    priceSource?: string;
    totalBalance?: number;
    circulatingSupply?: { tokens?: number };
    healthScore?: { score?: number; grade?: string };
    simpleTiers?: {
      dust?: { count?: number };
      retail?: { count?: number };
      serious?: { count?: number };
      whales?: { count?: number };
    };
    liquidityPoolsDetected?: number;
    lpPercentageOfSupply?: number;
    distributionStats?: {
      top5Percentage?: number;
      top10Percentage?: number;
      top20Percentage?: number;
    };
    riskFlags?: string[];
    insidersGraph?: { bundledPercentage?: number };
    launchpadInfo?: { name?: string };
    creatorInfo?: { creatorAddress?: string };
    socials?: { twitter?: string; telegram?: string; website?: string; discord?: string };
    dexStatus?: { hasDexPaid?: boolean; hasCTO?: boolean; activeBoosts?: number; hasAds?: boolean };
  },
  responseTimeMs: number,
  holderCount: number
): Promise<void> {
  // Run all logging in parallel - fire and forget
  const promises: Promise<void>[] = [];
  
  // Complete the search log
  if (searchId) {
    promises.push(completeSearchLog(searchId, responseTimeMs, holderCount));
  }
  
  // Log search results
  if (searchId) {
    promises.push(logSearchResults({
      searchId,
      tokenMint: result.tokenMint,
      symbol: result.symbol,
      name: result.name,
      marketCapUsd: result.marketCap,
      priceUsd: result.tokenPriceUSD,
      priceSource: result.priceSource,
      totalSupply: result.totalBalance,
      circulatingSupply: result.circulatingSupply?.tokens,
      healthScore: result.healthScore?.score,
      healthGrade: result.healthScore?.grade,
      tierDust: result.simpleTiers?.dust?.count,
      tierRetail: result.simpleTiers?.retail?.count,
      tierSerious: result.simpleTiers?.serious?.count,
      tierWhale: result.simpleTiers?.whales?.count,
      lpCount: result.liquidityPoolsDetected,
      lpPercentage: result.lpPercentageOfSupply,
      top5Concentration: result.distributionStats?.top5Percentage,
      top10Concentration: result.distributionStats?.top10Percentage,
      top20Concentration: result.distributionStats?.top20Percentage,
      riskFlags: result.riskFlags,
      bundledPercentage: result.insidersGraph?.bundledPercentage,
      launchpad: result.launchpadInfo?.name,
      creatorWallet: result.creatorInfo?.creatorAddress,
    }));
  }
  
  // Log socials
  if (result.socials) {
    promises.push(logSocialsHistory({
      tokenMint: result.tokenMint,
      twitter: result.socials.twitter,
      telegram: result.socials.telegram,
      website: result.socials.website,
      discord: result.socials.discord,
    }));
  }
  
  // Log DEX status
  if (result.dexStatus) {
    promises.push(logDexStatusHistory({
      tokenMint: result.tokenMint,
      hasPaidProfile: result.dexStatus.hasDexPaid || false,
      hasCto: result.dexStatus.hasCTO || false,
      activeBoosts: result.dexStatus.activeBoosts || 0,
      hasActiveAds: result.dexStatus.hasAds || false,
    }));
  }
  
  // Log price
  if (result.tokenPriceUSD && result.tokenPriceUSD > 0) {
    promises.push(logPriceHistory({
      tokenMint: result.tokenMint,
      priceUsd: result.tokenPriceUSD,
      marketCapUsd: result.marketCap,
      source: result.priceSource,
    }));
  }
  
  // Wait for all logging to complete (but don't block response)
  await Promise.allSettled(promises);
}
