import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('pumpfun-vip-monitor');

/**
 * PUMPFUN VIP MONITOR
 * 
 * Purpose: Intensive, real-time monitoring for qualified and buy_now tokens
 * Schedule: Every 15-30 seconds via cron
 * 
 * Logic:
 * 1. Get ALL tokens with status 'qualified' or 'buy_now'
 * 2. Fetch real-time metrics for each (with fallback APIs)
 * 3. EXPIRATION: Demote stale qualified (>30 min) or buy_now (>2 hours)
 * 4. Promotion: If qualified reaches 3x threshold (60 holders, 1.5 SOL) -> 'buy_now'
 * 5. Crash detection: If price drops 50%+ from ATH -> 'bombed'
 * 6. Socials check: Only check socials once per hour
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

interface VIPStats {
  tokensMonitored: number;
  promotedToBuyNow: number;
  bombed: number;
  expiredQualified: number;
  expiredBuyNow: number;
  socialsUpdated: number;
  duplicateTickerBlocked: number;
  errors: number;
  durationMs: number;
  promotedTokens: string[];
  bombedTokens: string[];
  expiredTokens: string[];
  duplicateBlockedTokens: string[];
}

// Cross-platform duplicate ticker check via DexScreener
// Returns true if a RECENT duplicate exists on another platform (should block)
// "Recent" = created within `maxAgeDays` (default 7 days). Older tickers are considered stale/reusable.
async function checkCrossPlatformDuplicate(
  symbol: string,
  ownMint: string,
  maxAgeDays: number = 7
): Promise<{ isDuplicate: boolean; existingMint?: string; existingName?: string; ageHours?: number; platform?: string }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { isDuplicate: false };

    const data = await response.json();
    const pairs = data.pairs || [];

    // Filter to Solana pairs with matching symbol (case-insensitive), excluding our own mint
    const matchingPairs = pairs.filter((p: any) =>
      p.chainId === 'solana' &&
      p.baseToken?.symbol?.toLowerCase() === symbol.toLowerCase() &&
      p.baseToken?.address !== ownMint
    );

    if (matchingPairs.length === 0) return { isDuplicate: false };

    // Find the oldest matching pair (the "original")
    let oldestPair: any = null;
    let oldestCreatedAt = Infinity;
    for (const pair of matchingPairs) {
      const created = pair.pairCreatedAt || 0;
      if (created > 0 && created < oldestCreatedAt) {
        oldestCreatedAt = created;
        oldestPair = pair;
      }
    }

    if (!oldestPair) return { isDuplicate: false };

    const ageMs = Date.now() - oldestCreatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    // If the existing token is OLDER than maxAgeDays, it's stale — allow ticker reuse
    if (ageMs > maxAgeMs) {
      console.log(`   ✅ CROSS-PLATFORM: $${symbol} exists on DexScreener but is ${(ageHours / 24).toFixed(0)} days old (>${maxAgeDays}d) — STALE, allowing`);
      return { isDuplicate: false };
    }

    // Recent duplicate found — block it
    const platform = oldestPair.labels?.includes('pump.fun') ? 'pump.fun' :
                     oldestPair.url?.includes('pump.fun') ? 'pump.fun' :
                     oldestPair.dexId || 'unknown';

    return {
      isDuplicate: true,
      existingMint: oldestPair.baseToken?.address,
      existingName: oldestPair.baseToken?.name,
      ageHours: Math.round(ageHours * 10) / 10,
      platform,
    };
  } catch (error) {
    console.warn(`   ⚠️ CROSS-PLATFORM check failed for $${symbol}: ${error}`);
    return { isDuplicate: false }; // Fail-open: don't block on API errors
  }
}

interface TokenMetrics {
  holders: number;
  volumeUsd: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  buys: number;
  sells: number;
  source: string;
}

// Fetch token metrics with fallback APIs
async function fetchTokenMetrics(mint: string): Promise<TokenMetrics | null> {
  // Try SolanaTracker first
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
    const response = await fetch(
      `https://data.solanatracker.io/tokens/${mint}`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const pool = data.pools?.[0];
      
      if (data.holders || pool?.price?.usd) {
        return {
          holders: data.holders || 0,
          volumeUsd: pool?.volume?.h24 || 0,
          priceUsd: pool?.price?.usd || null,
          liquidityUsd: pool?.liquidity?.usd || null,
          marketCapUsd: data.marketCap || null,
          buys: data.buys || 0,
          sells: data.sells || 0,
          source: 'solanatracker',
        };
      }
    }
  } catch (error) {
    console.log(`SolanaTracker failed for ${mint}, trying fallbacks...`);
  }

  // Fallback 1: DexScreener
  try {
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const pair = dexData?.pairs?.[0];
      
      if (pair) {
        return {
          holders: 0, // DexScreener doesn't provide holders
          volumeUsd: pair.volume?.h24 || 0,
          priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
          liquidityUsd: pair.liquidity?.usd || null,
          marketCapUsd: pair.marketCap || null,
          buys: pair.txns?.h24?.buys || 0,
          sells: pair.txns?.h24?.sells || 0,
          source: 'dexscreener',
        };
      }
    }
  } catch (error) {
    console.log(`DexScreener failed for ${mint}`);
  }

  // Fallback 2: Jupiter Price API
  try {
    const jupResponse = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (jupResponse.ok) {
      const jupData = await jupResponse.json();
      const price = jupData?.data?.[mint]?.price;
      
      if (price) {
        return {
          holders: 0,
          volumeUsd: 0,
          priceUsd: price,
          liquidityUsd: null,
          marketCapUsd: null,
          buys: 0,
          sells: 0,
          source: 'jupiter',
        };
      }
    }
  } catch (error) {
    console.log(`Jupiter failed for ${mint}`);
  }

  // Fallback 3: Pump.fun API
  try {
    const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (pumpResponse.ok) {
      const pumpData = await pumpResponse.json();
      
      if (pumpData) {
        return {
          holders: 0,
          volumeUsd: 0,
          priceUsd: pumpData.usd_market_cap && pumpData.total_supply 
            ? pumpData.usd_market_cap / pumpData.total_supply 
            : null,
          liquidityUsd: null,
          marketCapUsd: pumpData.usd_market_cap || null,
          buys: 0,
          sells: 0,
          source: 'pumpfun',
        };
      }
    }
  } catch (error) {
    console.log(`Pump.fun failed for ${mint}`);
  }

  return null;
}

// Fetch social info (Twitter, Telegram, Website)
async function fetchSocialInfo(mint: string): Promise<{ twitter?: string; telegram?: string; website?: string } | null> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      twitter: data.twitter || null,
      telegram: data.telegram || null,
      website: data.website || null,
    };
  } catch {
    return null;
  }
}

// Get current SOL price
async function getSolPrice(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('sol_price_cache')
      .select('price_usd')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    return data?.price_usd || 200;
  } catch {
    return 200;
  }
}

// Get config
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    qualification_holder_count: data?.qualification_holder_count ?? 20,
    qualification_volume_sol: data?.qualification_volume_sol ?? 0.5,
  };
}

// Main VIP monitoring logic
async function monitorVIPTokens(supabase: any): Promise<VIPStats> {
  const startTime = Date.now();
  const stats: VIPStats = {
    tokensMonitored: 0,
    promotedToBuyNow: 0,
    bombed: 0,
    expiredQualified: 0,
    expiredBuyNow: 0,
    socialsUpdated: 0,
    duplicateTickerBlocked: 0,
    errors: 0,
    durationMs: 0,
    promotedTokens: [],
    bombedTokens: [],
    expiredTokens: [],
    duplicateBlockedTokens: [],
  };

  console.log('⭐ VIP MONITOR: Starting VIP monitoring cycle...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const solPrice = await getSolPrice(supabase);
  const now = new Date();
  const nowIso = now.toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  // Get all qualified and buy_now tokens
  const { data: vipTokens, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['qualified', 'buy_now'])
    .order('qualified_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching VIP tokens:', fetchError);
    stats.errors++;
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`👑 Monitoring ${vipTokens?.length || 0} VIP tokens`);

  // 3x thresholds for buy_now promotion
  const buyNowHolderThreshold = config.qualification_holder_count * 3; // 60
  const buyNowVolumeThreshold = config.qualification_volume_sol * 3;   // 1.5 SOL

  for (const token of (vipTokens || [])) {
    try {
      stats.tokensMonitored++;

      const qualifiedAt = new Date(token.qualified_at);
      const ageMinutes = (now.getTime() - qualifiedAt.getTime()) / (1000 * 60);

      // EXPIRATION CHECK - before fetching metrics to save API calls
      
      // Expire qualified tokens after 30 minutes without promotion
      if (token.status === 'qualified' && token.qualified_at < thirtyMinsAgo) {
        const { error: expireError } = await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'rejected',
            demoted_at: nowIso,
            demotion_reason: `Expired: qualified for ${Math.floor(ageMinutes)} mins without promotion`,
            removal_reason: 'Auto-expired: Too old for pump.fun',
            last_checked_at: nowIso,
          })
          .eq('id', token.id);

        if (!expireError) {
          stats.expiredQualified++;
          stats.expiredTokens.push(`${token.token_symbol} (qualified ${Math.floor(ageMinutes)}m)`);
          console.log(`⏰ EXPIRED: ${token.token_symbol} - qualified for ${Math.floor(ageMinutes)} minutes`);
        }
        continue; // Skip further processing
      }

      // Expire buy_now tokens after 2 hours (way too old for pump.fun)
      if (token.status === 'buy_now' && token.qualified_at < twoHoursAgo) {
        const { error: expireError } = await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'rejected',
            demoted_at: nowIso,
            demotion_reason: `Expired: buy_now for ${Math.floor(ageMinutes)} mins without execution`,
            removal_reason: 'Auto-expired: Too old for pump.fun',
            last_checked_at: nowIso,
          })
          .eq('id', token.id);

        if (!expireError) {
          stats.expiredBuyNow++;
          stats.expiredTokens.push(`${token.token_symbol} (buy_now ${Math.floor(ageMinutes)}m)`);
          console.log(`⏰ EXPIRED: ${token.token_symbol} - buy_now for ${Math.floor(ageMinutes)} minutes`);
        }
        continue; // Skip further processing
      }

      // Now fetch metrics for tokens that passed expiration check
      const metrics = await fetchTokenMetrics(token.token_mint);
      if (!metrics) {
        console.log(`⚠️ Could not fetch metrics for VIP ${token.token_symbol} (all APIs failed)`);
        stats.errors++;
        
        // If we can't get metrics for a qualified token after 15 mins, expire it
        if (token.status === 'qualified' && ageMinutes > 15) {
          await supabase
            .from('pumpfun_watchlist')
            .update({
              status: 'rejected',
              demoted_at: nowIso,
              demotion_reason: 'Expired: Unable to fetch metrics from any API',
              removal_reason: 'Auto-expired: No API data available',
              last_checked_at: nowIso,
            })
            .eq('id', token.id);
          stats.expiredQualified++;
          stats.expiredTokens.push(`${token.token_symbol} (no API data)`);
        }
        continue;
      }

      // Small delay for rate limiting
      await new Promise(r => setTimeout(r, 30));

      const volumeSol = solPrice > 0 ? metrics.volumeUsd / solPrice : 0;
      const txCount = metrics.buys + metrics.sells;

      const updates: any = {
        last_checked_at: nowIso,
        check_count: (token.check_count || 0) + 1,
        holder_count_prev: token.holder_count,
        volume_sol_prev: token.volume_sol,
        price_usd_prev: token.price_usd,
        volume_sol: volumeSol,
        tx_count: txCount,
        price_usd: metrics.priceUsd,
        market_cap_usd: metrics.marketCapUsd,
        liquidity_usd: metrics.liquidityUsd,
        price_ath_usd: Math.max(token.price_ath_usd || 0, metrics.priceUsd || 0),
        last_processor: `vip-monitor-${metrics.source}`,
      };

      // Only update holders if we got them from API (DexScreener/Jupiter don't provide)
      if (metrics.holders > 0) {
        updates.holder_count = metrics.holders;
        updates.holder_count_peak = Math.max(token.holder_count_peak || 0, metrics.holders);
      }

      // DECAY CHECK - qualified token with declining metrics after 10 mins
      if (token.status === 'qualified' && ageMinutes > 10) {
        const holdersDeclined = metrics.holders > 0 && token.holder_count > 0 && metrics.holders < token.holder_count * 0.8;
        const volumeDead = volumeSol < 0.1 && (token.volume_sol || 0) > 0.2;
        
        if (holdersDeclined || volumeDead) {
          updates.status = 'rejected';
          updates.demoted_at = nowIso;
          updates.demotion_reason = holdersDeclined 
            ? `Decay: Holders dropped from ${token.holder_count} to ${metrics.holders}` 
            : `Decay: Volume died (${volumeSol.toFixed(2)} SOL)`;
          updates.removal_reason = 'Auto-demoted: Metrics declining';
          
          stats.expiredQualified++;
          stats.expiredTokens.push(`${token.token_symbol} (decay)`);
          console.log(`📉 DECAY: ${token.token_symbol} - ${updates.demotion_reason}`);
        }
      }

      // BOMBED CHECK - price crashed 50%+ from ATH
      if (!updates.status && token.price_ath_usd && metrics.priceUsd) {
        const dropPct = ((token.price_ath_usd - metrics.priceUsd) / token.price_ath_usd) * 100;
        if (dropPct >= 50) {
          updates.status = 'bombed';
          updates.removed_at = nowIso;
          updates.removal_reason = `Price dropped ${dropPct.toFixed(0)}% from ATH ($${token.price_ath_usd.toFixed(8)} -> $${metrics.priceUsd.toFixed(8)})`;
          
          stats.bombed++;
          stats.bombedTokens.push(`${token.token_symbol} (-${dropPct.toFixed(0)}%)`);
          console.log(`💥 BOMBED: ${token.token_symbol} - ${updates.removal_reason}`);
        }
      }

      // BUY_NOW PROMOTION - qualified token exceeds 3x thresholds
      if (token.status === 'qualified' && !updates.status) {
        const holdersOk = metrics.holders >= buyNowHolderThreshold || (metrics.holders === 0 && token.holder_count >= buyNowHolderThreshold);
        const volumeOk = volumeSol >= buyNowVolumeThreshold;
        
        if (holdersOk && volumeOk) {
          // === CROSS-PLATFORM DUPLICATE TICKER GATE ===
          // Check DexScreener for same-symbol tokens on other launchpads (bags.fm, bonk.fun, etc.)
          // Only block if the existing token was created within 7 days (recent = likely same hype cycle)
          const dupCheck = await checkCrossPlatformDuplicate(token.token_symbol, token.token_mint, 7);
          
          if (dupCheck.isDuplicate) {
            console.log(`🚫 CROSS-PLATFORM DUPLICATE BLOCKED: $${token.token_symbol} — already exists as ${dupCheck.existingMint?.slice(0,8)}... on ${dupCheck.platform} (${dupCheck.ageHours}h ago, name: "${dupCheck.existingName}")`);
            
            // Don't promote — mark as rejected
            updates.status = 'rejected';
            updates.rejection_reason = `cross_platform_duplicate:${dupCheck.existingMint?.slice(0,8)}`;
            updates.rejection_type = 'permanent';
            updates.removal_reason = `Cross-platform duplicate ticker — $${token.token_symbol} already exists on ${dupCheck.platform} (${dupCheck.ageHours}h old, mint: ${dupCheck.existingMint})`;
            
            stats.duplicateTickerBlocked++;
            stats.duplicateBlockedTokens.push(`${token.token_symbol} (${dupCheck.platform}, ${dupCheck.ageHours}h)`);
          } else {
            updates.status = 'buy_now';
            updates.promoted_to_buy_now_at = nowIso;
            updates.price_at_buy_now_usd = metrics.priceUsd || token.price_usd;
            updates.qualification_reason = `PROMOTED: ${metrics.holders || token.holder_count} holders, ${volumeSol.toFixed(2)} SOL volume`;
            
            stats.promotedToBuyNow++;
            stats.promotedTokens.push(`${token.token_symbol} (${metrics.holders || token.holder_count} holders, ${volumeSol.toFixed(2)} SOL)`);
            console.log(`🚀 BUY_NOW PROMOTION: ${token.token_symbol} - ${updates.qualification_reason}`);
          }
        }
      }

      // SOCIALS CHECK - only once per hour
      if (!token.socials_checked_at || token.socials_checked_at < oneHourAgo) {
        const socials = await fetchSocialInfo(token.token_mint);
        if (socials) {
          updates.socials_checked_at = nowIso;
          
          // Calculate social score
          let socialScore = 0;
          if (socials.twitter) socialScore += 30;
          if (socials.telegram) socialScore += 30;
          if (socials.website) socialScore += 40;
          
          updates.social_score = socialScore;
          updates.metadata = { 
            ...token.metadata, 
            socials,
            socials_last_checked: nowIso,
          };
          
          stats.socialsUpdated++;
          console.log(`📱 Socials updated for ${token.token_symbol}: score ${socialScore}`);
        }
      }

      // Update the token
      const { error: updateError } = await supabase
        .from('pumpfun_watchlist')
        .update(updates)
        .eq('id', token.id);

      if (updateError) {
        console.error(`Error updating VIP ${token.token_symbol}:`, updateError);
        stats.errors++;
      }

    } catch (error) {
      console.error(`Error processing VIP ${token.token_symbol}:`, error);
      stats.errors++;
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 VIP MONITOR COMPLETE: ${stats.tokensMonitored} monitored, ${stats.promotedToBuyNow} promoted, ${stats.bombed} bombed, ${stats.expiredQualified + stats.expiredBuyNow} expired (${stats.durationMs}ms)`);

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';

    console.log(`🎯 pumpfun-vip-monitor action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorVIPTokens(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const { count: qualifiedCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'qualified');

        const { count: buyNowCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'buy_now');

        return jsonResponse({
          success: true,
          status: 'healthy',
          qualifiedCount: qualifiedCount || 0,
          buyNowCount: buyNowCount || 0,
          totalVIP: (qualifiedCount || 0) + (buyNowCount || 0),
        });
      }

      case 'vip_list': {
        const { data: vipTokens } = await supabase
          .from('pumpfun_watchlist')
          .select('*')
          .in('status', ['qualified', 'buy_now'])
          .order('qualified_at', { ascending: false })
          .limit(50);

        return jsonResponse({
          success: true,
          tokens: vipTokens || [],
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-vip-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
