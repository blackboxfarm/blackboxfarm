import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN WATCHLIST MONITOR
 * 
 * Purpose: Monitor ALL watching tokens, update metrics, promote or demote
 * Schedule: Every 60-120 seconds via cron
 * 
 * Logic:
 * 1. Get ALL tokens with status 'watching' from database (batch of 100)
 * 2. Fetch current metrics for each token directly from API
 * 3. Compare to previous metrics and update database
 * 4. Promotion: If holders >= 20 AND volume >= 0.5 SOL AND watched >= 2 min -> 'qualified'
 * 5. Staleness: If NO changes for 3+ consecutive checks -> increment stale counter
 * 6. Dead check: If holders < 3 OR volume < 0.01 SOL after 15+ minutes -> 'dead'
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

interface MonitorStats {
  tokensChecked: number;
  tokensUpdated: number;
  promoted: number;
  markedDead: number;
  markedStale: number;
  errors: number;
  durationMs: number;
  promotedTokens: string[];
  deadTokens: string[];
}

interface TokenMetrics {
  holders: number;
  volume24h: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  buys: number;
  sells: number;
}

// Fetch token metrics directly from Solana Tracker
async function fetchTokenMetrics(mint: string): Promise<TokenMetrics | null> {
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

    if (!response.ok) {
      if (response.status === 404) {
        // Token no longer exists on API - mark as dead
        return { holders: 0, volume24h: 0, priceUsd: null, liquidityUsd: null, marketCapUsd: null, buys: 0, sells: 0 };
      }
      console.error(`API error for ${mint}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pool = data.pools?.[0];
    
    return {
      holders: data.holders || 0,
      volume24h: pool?.volume?.h24 || 0,
      priceUsd: pool?.price?.usd || null,
      liquidityUsd: pool?.liquidity?.usd || null,
      marketCapUsd: data.marketCap || (pool?.price?.usd ? pool.price.usd * 1_000_000_000 : null),
      buys: data.buys || 0,
      sells: data.sells || 0,
    };
  } catch (error) {
    console.error(`Error fetching metrics for ${mint}:`, error);
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

// Get monitor config
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    min_watch_time_minutes: data?.min_watch_time_minutes ?? 2,
    max_watch_time_minutes: data?.max_watch_time_minutes ?? 60,
    dead_holder_threshold: data?.dead_holder_threshold ?? 3,
    dead_volume_threshold_sol: data?.dead_volume_threshold_sol ?? 0.01,
    qualification_holder_count: data?.qualification_holder_count ?? 20,
    qualification_volume_sol: data?.qualification_volume_sol ?? 0.5,
    max_bundle_score: data?.max_bundle_score ?? 70,
  };
}

// Main monitoring logic
async function monitorWatchlistTokens(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    tokensChecked: 0,
    tokensUpdated: 0,
    promoted: 0,
    markedDead: 0,
    markedStale: 0,
    errors: 0,
    durationMs: 0,
    promotedTokens: [],
    deadTokens: [],
  };

  console.log('👁️ WATCHLIST MONITOR: Starting monitoring cycle...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const solPrice = await getSolPrice(supabase);
  const now = new Date();

  // Get all watching tokens, prioritize oldest checked first
  const { data: watchingTokens, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching')
    .order('last_checked_at', { ascending: true })
    .limit(100); // Process 100 at a time

  if (fetchError) {
    console.error('Error fetching watchlist:', fetchError);
    stats.errors++;
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Processing ${watchingTokens?.length || 0} watching tokens`);

  for (const token of (watchingTokens || [])) {
    try {
      stats.tokensChecked++;

      // Fetch current metrics from API
      const metrics = await fetchTokenMetrics(token.token_mint);
      
      if (!metrics) {
        console.log(`⚠️ Could not fetch metrics for ${token.token_symbol}`);
        stats.errors++;
        continue;
      }

      // Add small delay for rate limiting
      await new Promise(r => setTimeout(r, 50));

      const volumeSol = solPrice > 0 ? metrics.volume24h / solPrice : 0;
      const txCount = metrics.buys + metrics.sells;
      const watchingMinutes = (now.getTime() - new Date(token.first_seen_at).getTime()) / 60000;

      // Generate metrics hash for staleness detection
      const newMetricsHash = `${metrics.holders}-${volumeSol.toFixed(4)}-${metrics.priceUsd?.toFixed(8) || '0'}`;
      const isStale = token.metrics_hash === newMetricsHash;

      const updates: any = {
        last_checked_at: now.toISOString(),
        check_count: (token.check_count || 0) + 1,
        // Shift current to prev
        holder_count_prev: token.holder_count,
        volume_sol_prev: token.volume_sol,
        price_usd_prev: token.price_usd,
        // Set new current
        holder_count: metrics.holders,
        volume_sol: volumeSol,
        tx_count: txCount,
        price_usd: metrics.priceUsd,
        market_cap_usd: metrics.marketCapUsd,
        liquidity_usd: metrics.liquidityUsd,
        // Track peaks
        holder_count_peak: Math.max(token.holder_count_peak || 0, metrics.holders),
        price_ath_usd: Math.max(token.price_ath_usd || 0, metrics.priceUsd || 0),
        // Staleness tracking
        metrics_hash: newMetricsHash,
        consecutive_stale_checks: isStale ? (token.consecutive_stale_checks || 0) + 1 : 0,
        last_processor: 'watchlist-monitor',
      };

      // QUALIFICATION CHECK
      if (watchingMinutes >= config.min_watch_time_minutes && 
          metrics.holders >= config.qualification_holder_count && 
          volumeSol >= config.qualification_volume_sol &&
          (token.bundle_score === null || token.bundle_score <= config.max_bundle_score)) {
        
        updates.status = 'qualified';
        updates.qualified_at = now.toISOString();
        updates.qualification_reason = `Holders: ${metrics.holders}, Volume: ${volumeSol.toFixed(2)} SOL, Watched: ${watchingMinutes.toFixed(0)}m`;
        
        stats.promoted++;
        stats.promotedTokens.push(`${token.token_symbol} (${metrics.holders} holders, ${volumeSol.toFixed(2)} SOL)`);
        console.log(`🎉 PROMOTED: ${token.token_symbol} - ${updates.qualification_reason}`);

        // Also add to buy candidates
        await supabase.from('pumpfun_buy_candidates').upsert({
          token_mint: token.token_mint,
          token_name: token.token_name,
          token_symbol: token.token_symbol,
          creator_wallet: token.creator_wallet,
          volume_sol_5m: volumeSol,
          volume_usd_5m: metrics.volume24h,
          holder_count: metrics.holders,
          transaction_count: txCount,
          bundle_score: token.bundle_score,
          status: 'pending',
          detected_at: now.toISOString(),
          metadata: { watchlist_qualification: updates.qualification_reason },
        }, { onConflict: 'token_mint' });
      }
      
      // DEAD CHECK - token has been watching too long with no activity
      else if (watchingMinutes > config.max_watch_time_minutes || 
               (watchingMinutes > 15 && metrics.holders < config.dead_holder_threshold && volumeSol < config.dead_volume_threshold_sol)) {
        
        updates.status = 'dead';
        updates.removed_at = now.toISOString();
        updates.removal_reason = `Watched ${watchingMinutes.toFixed(0)}m, only ${metrics.holders} holders, ${volumeSol.toFixed(3)} SOL`;
        
        stats.markedDead++;
        stats.deadTokens.push(`${token.token_symbol} (${metrics.holders} holders)`);
        console.log(`💀 DEAD: ${token.token_symbol} - ${updates.removal_reason}`);
      }
      
      // STALE CHECK - no changes for multiple consecutive checks
      else if (updates.consecutive_stale_checks >= 5 && watchingMinutes > 10) {
        // Very stale with no changes - likely dead but might resurrect
        updates.status = 'dead';
        updates.removed_at = now.toISOString();
        updates.removal_reason = `Stale: No metric changes for ${updates.consecutive_stale_checks} checks`;
        
        stats.markedStale++;
        console.log(`🥀 STALE -> DEAD: ${token.token_symbol} (${updates.consecutive_stale_checks} stale checks)`);
      }

      // Update the token
      const { error: updateError } = await supabase
        .from('pumpfun_watchlist')
        .update(updates)
        .eq('id', token.id);

      if (updateError) {
        console.error(`Error updating ${token.token_symbol}:`, updateError);
        stats.errors++;
      } else {
        stats.tokensUpdated++;
      }

    } catch (error) {
      console.error(`Error processing ${token.token_symbol}:`, error);
      stats.errors++;
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 MONITOR COMPLETE: ${stats.tokensChecked} checked, ${stats.promoted} promoted, ${stats.markedDead} dead, ${stats.markedStale} stale (${stats.durationMs}ms)`);

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

    console.log(`🎯 pumpfun-watchlist-monitor action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorWatchlistTokens(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const { count: watchingCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'watching');

        const { count: staleCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'watching')
          .gte('consecutive_stale_checks', 3);

        return jsonResponse({
          success: true,
          status: 'healthy',
          watchingCount: watchingCount || 0,
          staleCount: staleCount || 0,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-watchlist-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
