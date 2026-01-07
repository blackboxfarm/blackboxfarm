import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeDetection {
  token_mint: string;
  token_symbol?: string;
  buyer_wallets: string[];
  seller_wallets?: string[];
  market_cap?: number;
  bonding_curve_pct?: number;
  time_since_mint_mins?: number;
}

interface KOLAnalysis {
  detected: boolean;
  kol_wallets: string[];
  kol_count: number;
  kol_tiers: string[];
  avg_trust_score: number;
  kill_risk: 'low' | 'medium' | 'high' | 'critical';
  suggested_adjustment: {
    profit_target_multiplier: number;
    moonbag_pct: number;
    stop_loss_pct: number;
    exit_alert_if_kol_sells: boolean;
  };
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...params } = await req.json();

    switch (action) {
      case 'detect-kols': {
        const { trades } = params as { trades: TradeDetection[] };
        const results = [];

        for (const trade of trades) {
          const analysis = await detectKOLsInTrade(supabase, trade);
          results.push({ token_mint: trade.token_mint, analysis });

          // Log activity for detected KOLs
          if (analysis.detected) {
            await logKOLActivity(supabase, trade, analysis);
          }
        }

        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'log-trade': {
        const { kol_wallet, token_mint, token_symbol, action: tradeAction, amount_sol, 
                amount_tokens, price_at_trade, market_cap_at_trade, bonding_curve_pct,
                time_since_mint_mins, tx_signature } = params;

        // Get KOL info
        const { data: kol } = await supabase
          .from('pumpfun_kol_registry')
          .select('id')
          .eq('wallet_address', kol_wallet)
          .single();

        // Determine buy zone
        const buy_zone = getBuyZone(bonding_curve_pct, time_since_mint_mins);

        const { data, error } = await supabase
          .from('pumpfun_kol_activity')
          .upsert({
            kol_id: kol?.id,
            kol_wallet,
            token_mint,
            token_symbol,
            action: tradeAction,
            amount_sol,
            amount_tokens,
            price_at_trade,
            market_cap_at_trade,
            bonding_curve_pct,
            buy_zone,
            time_since_mint_mins,
            tx_signature,
            detected_at: new Date().toISOString()
          }, { onConflict: 'kol_wallet,token_mint,action,tx_signature' })
          .select()
          .single();

        if (error) throw error;

        // Update KOL stats
        await updateKOLStats(supabase, kol_wallet, tradeAction, amount_sol);

        return new Response(JSON.stringify({ success: true, activity: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-activity': {
        const { token_mint, kol_wallet, limit = 50, offset = 0 } = params;
        let query = supabase
          .from('pumpfun_kol_activity')
          .select(`
            *,
            kol:pumpfun_kol_registry(wallet_address, display_name, twitter_handle, kol_tier, trust_score)
          `)
          .order('detected_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (token_mint) query = query.eq('token_mint', token_mint);
        if (kol_wallet) query = query.eq('kol_wallet', kol_wallet);

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, activity: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'detect-chart-kill': {
        const { token_mint, kol_wallet, sell_price, current_price, time_delta_mins } = params;
        
        const priceDropPct = ((sell_price - current_price) / sell_price) * 100;
        const isChartKill = priceDropPct > 50 && time_delta_mins <= 10;

        if (isChartKill) {
          // Mark the sell as a chart kill
          await supabase
            .from('pumpfun_kol_activity')
            .update({ chart_killed: true })
            .eq('token_mint', token_mint)
            .eq('kol_wallet', kol_wallet)
            .eq('action', 'sell');

          // Increment chart_kills on KOL
          const { data: kol } = await supabase
            .from('pumpfun_kol_registry')
            .select('chart_kills')
            .eq('wallet_address', kol_wallet)
            .single();

          await supabase
            .from('pumpfun_kol_registry')
            .update({ 
              chart_kills: (kol?.chart_kills || 0) + 1,
              trust_score: Math.max(0, ((kol as any)?.trust_score || 50) - 10)
            })
            .eq('wallet_address', kol_wallet);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          is_chart_kill: isChartKill,
          price_drop_pct: priceDropPct,
          time_delta_mins
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('KOL Tracker error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function detectKOLsInTrade(supabase: any, trade: TradeDetection): Promise<KOLAnalysis> {
  // Check buyer wallets against KOL registry
  const { data: kols } = await supabase
    .from('pumpfun_kol_registry')
    .select('*')
    .in('wallet_address', trade.buyer_wallets)
    .eq('is_active', true);

  if (!kols || kols.length === 0) {
    return {
      detected: false,
      kol_wallets: [],
      kol_count: 0,
      kol_tiers: [],
      avg_trust_score: 0,
      kill_risk: 'low',
      suggested_adjustment: {
        profit_target_multiplier: 1.5,
        moonbag_pct: 10,
        stop_loss_pct: -25,
        exit_alert_if_kol_sells: false
      },
      reasoning: 'No KOLs detected in buyer wallets'
    };
  }

  const kol_wallets = kols.map((k: any) => k.wallet_address);
  const kol_tiers = [...new Set(kols.map((k: any) => k.kol_tier))];
  const avg_trust_score = kols.reduce((sum: number, k: any) => sum + (k.trust_score || 50), 0) / kols.length;
  const total_chart_kills = kols.reduce((sum: number, k: any) => sum + (k.chart_kills || 0), 0);

  // Determine kill risk
  let kill_risk: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (avg_trust_score < 30 || total_chart_kills > 5) {
    kill_risk = 'critical';
  } else if (avg_trust_score < 50 || total_chart_kills > 2) {
    kill_risk = 'high';
  } else if (avg_trust_score < 70 || total_chart_kills > 0) {
    kill_risk = 'medium';
  }

  // Calculate suggested adjustments based on trust score
  const suggested_adjustment = calculateTradingAdjustments(avg_trust_score, kill_risk, kols.length);

  return {
    detected: true,
    kol_wallets,
    kol_count: kols.length,
    kol_tiers,
    avg_trust_score,
    kill_risk,
    suggested_adjustment,
    reasoning: `${kols.length} KOL(s) detected with avg trust ${avg_trust_score.toFixed(0)}, ${total_chart_kills} total chart kills`
  };
}

function calculateTradingAdjustments(trustScore: number, killRisk: string, kolCount: number) {
  if (trustScore >= 80) {
    return {
      profit_target_multiplier: 3.0,
      moonbag_pct: 20,
      stop_loss_pct: -15,
      exit_alert_if_kol_sells: true
    };
  } else if (trustScore >= 60) {
    return {
      profit_target_multiplier: 2.0,
      moonbag_pct: 15,
      stop_loss_pct: -20,
      exit_alert_if_kol_sells: true
    };
  } else if (trustScore >= 40) {
    return {
      profit_target_multiplier: 1.5,
      moonbag_pct: 10,
      stop_loss_pct: -15,
      exit_alert_if_kol_sells: true
    };
  } else {
    // Low trust - be very cautious
    return {
      profit_target_multiplier: 1.3,
      moonbag_pct: 5,
      stop_loss_pct: -10,
      exit_alert_if_kol_sells: true
    };
  }
}

function getBuyZone(bondingCurvePct?: number, timeSinceMint?: number): string {
  if (bondingCurvePct !== undefined) {
    if (bondingCurvePct < 30) return 'early_curve';
    if (bondingCurvePct < 70) return 'mid_curve';
    if (bondingCurvePct < 100) return 'late_curve';
    return 'graduated';
  }
  if (timeSinceMint !== undefined) {
    if (timeSinceMint < 5) return 'early_curve';
    if (timeSinceMint < 30) return 'mid_curve';
    if (timeSinceMint < 120) return 'late_curve';
    return 'graduated';
  }
  return 'early_curve';
}

async function logKOLActivity(supabase: any, trade: TradeDetection, analysis: KOLAnalysis) {
  for (const wallet of analysis.kol_wallets) {
    const { data: kol } = await supabase
      .from('pumpfun_kol_registry')
      .select('id')
      .eq('wallet_address', wallet)
      .single();

    await supabase
      .from('pumpfun_kol_activity')
      .upsert({
        kol_id: kol?.id,
        kol_wallet: wallet,
        token_mint: trade.token_mint,
        token_symbol: trade.token_symbol,
        action: 'buy',
        market_cap_at_trade: trade.market_cap,
        bonding_curve_pct: trade.bonding_curve_pct,
        buy_zone: getBuyZone(trade.bonding_curve_pct, trade.time_since_mint_mins),
        time_since_mint_mins: trade.time_since_mint_mins,
        detected_at: new Date().toISOString()
      }, { onConflict: 'kol_wallet,token_mint,action,tx_signature', ignoreDuplicates: true });
  }
}

async function updateKOLStats(supabase: any, wallet: string, action: string, amount?: number) {
  const { data: kol } = await supabase
    .from('pumpfun_kol_registry')
    .select('total_trades, total_volume_sol')
    .eq('wallet_address', wallet)
    .single();

  if (kol) {
    await supabase
      .from('pumpfun_kol_registry')
      .update({
        total_trades: (kol.total_trades || 0) + 1,
        total_volume_sol: (kol.total_volume_sol || 0) + (amount || 0),
        last_activity_at: new Date().toISOString()
      })
      .eq('wallet_address', wallet);
  }
}
