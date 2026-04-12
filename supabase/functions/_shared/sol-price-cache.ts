/**
 * Shared SOL Price Cache Reader with Staleness Guard
 * 
 * Reads from sol_price_cache table but rejects values older than MAX_STALE_MS.
 * Falls back to the shared sol-price-fetcher for live price.
 */

import { getSolPriceQuick } from './sol-price-fetcher.ts';

const MAX_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get SOL price from cache with staleness guard.
 * If cache is stale (>5 min), fetches live price instead.
 * NEVER returns a hardcoded fallback — returns real price or throws.
 */
export async function getSolPriceFromCache(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('sol_price_cache')
      .select('price_usd, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data?.price_usd && data?.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      if (age < MAX_STALE_MS) {
        return data.price_usd;
      }
      console.log(`[SOL Price Cache] ⚠️ Stale cache (${(age / 1000).toFixed(0)}s old), fetching live...`);
    }
  } catch {
    // Cache read failed, fall through to live fetch
  }

  // Live fetch via shared utility
  try {
    return await getSolPriceQuick();
  } catch (error) {
    console.error('[SOL Price Cache] ❌ All price sources failed:', error);
    throw new Error('SOL price unavailable from all sources');
  }
}
