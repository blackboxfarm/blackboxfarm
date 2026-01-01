import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN VIP MONITOR
 * 
 * Purpose: Intensive, real-time monitoring for qualified and buy_now tokens
 * Schedule: Every 15-30 seconds via cron
 * 
 * Logic:
 * 1. Get ALL tokens with status 'qualified' or 'buy_now'
 * 2. Fetch real-time metrics for each (high priority)
 * 3. Promotion: If qualified reaches 3x threshold (60 holders, 1.5 SOL) -> 'buy_now'
 * 4. Crash detection: If price drops 50%+ from ATH -> 'bombed'
 * 5. Socials check: Only check socials once per hour (store socials_checked_at)
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
  socialsUpdated: number;
  errors: number;
  durationMs: number;
  promotedTokens: string[];
  bombedTokens: string[];
}

interface TokenMetrics {
  holders: number;
  volumeUsd: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  buys: number;
  sells: number;
}

// Fetch token metrics
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
      return null;
    }

    const data = await response.json();
    const pool = data.pools?.[0];
    
    return {
      holders: data.holders || 0,
      volumeUsd: pool?.volume?.h24 || 0,
      priceUsd: pool?.price?.usd || null,
      liquidityUsd: pool?.liquidity?.usd || null,
      marketCapUsd: data.marketCap || null,
      buys: data.buys || 0,
      sells: data.sells || 0,
    };
  } catch (error) {
    console.error(`Error fetching metrics for ${mint}:`, error);
    return null;
  }
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
    socialsUpdated: 0,
    errors: 0,
    durationMs: 0,
    promotedTokens: [],
    bombedTokens: [],
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
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

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

      const metrics = await fetchTokenMetrics(token.token_mint);
      if (!metrics) {
        console.log(`⚠️ Could not fetch metrics for VIP ${token.token_symbol}`);
        stats.errors++;
        continue;
      }

      // Small delay for rate limiting
      await new Promise(r => setTimeout(r, 30));

      const volumeSol = solPrice > 0 ? metrics.volumeUsd / solPrice : 0;
      const txCount = metrics.buys + metrics.sells;

      const updates: any = {
        last_checked_at: now.toISOString(),
        check_count: (token.check_count || 0) + 1,
        holder_count_prev: token.holder_count,
        volume_sol_prev: token.volume_sol,
        price_usd_prev: token.price_usd,
        holder_count: metrics.holders,
        volume_sol: volumeSol,
        tx_count: txCount,
        price_usd: metrics.priceUsd,
        market_cap_usd: metrics.marketCapUsd,
        liquidity_usd: metrics.liquidityUsd,
        holder_count_peak: Math.max(token.holder_count_peak || 0, metrics.holders),
        price_ath_usd: Math.max(token.price_ath_usd || 0, metrics.priceUsd || 0),
        last_processor: 'vip-monitor',
      };

      // BOMBED CHECK - price crashed 50%+ from ATH
      if (token.price_ath_usd && metrics.priceUsd) {
        const dropPct = ((token.price_ath_usd - metrics.priceUsd) / token.price_ath_usd) * 100;
        if (dropPct >= 50) {
          updates.status = 'bombed';
          updates.removed_at = now.toISOString();
          updates.removal_reason = `Price dropped ${dropPct.toFixed(0)}% from ATH ($${token.price_ath_usd.toFixed(8)} -> $${metrics.priceUsd.toFixed(8)})`;
          
          stats.bombed++;
          stats.bombedTokens.push(`${token.token_symbol} (-${dropPct.toFixed(0)}%)`);
          console.log(`💥 BOMBED: ${token.token_symbol} - ${updates.removal_reason}`);
        }
      }

      // BUY_NOW PROMOTION - qualified token exceeds 3x thresholds
      if (token.status === 'qualified' && !updates.status) {
        if (metrics.holders >= buyNowHolderThreshold && volumeSol >= buyNowVolumeThreshold) {
          updates.status = 'buy_now';
          updates.qualification_reason = `PROMOTED: ${metrics.holders} holders (3x), ${volumeSol.toFixed(2)} SOL (3x threshold)`;
          
          stats.promotedToBuyNow++;
          stats.promotedTokens.push(`${token.token_symbol} (${metrics.holders} holders, ${volumeSol.toFixed(2)} SOL)`);
          console.log(`🚀 BUY_NOW PROMOTION: ${token.token_symbol} - ${updates.qualification_reason}`);
        }
      }

      // SOCIALS CHECK - only once per hour
      if (!token.socials_checked_at || token.socials_checked_at < oneHourAgo) {
        const socials = await fetchSocialInfo(token.token_mint);
        if (socials) {
          updates.socials_checked_at = now.toISOString();
          
          // Calculate social score
          let socialScore = 0;
          if (socials.twitter) socialScore += 30;
          if (socials.telegram) socialScore += 30;
          if (socials.website) socialScore += 40;
          
          updates.social_score = socialScore;
          updates.metadata = { 
            ...token.metadata, 
            socials,
            socials_last_checked: now.toISOString(),
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
  console.log(`📊 VIP MONITOR COMPLETE: ${stats.tokensMonitored} monitored, ${stats.promotedToBuyNow} promoted to buy_now, ${stats.bombed} bombed (${stats.durationMs}ms)`);

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
