import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Fetch prices from Jupiter with DexScreener fallback
async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (tokenMints.length === 0) return prices;

  try {
    const ids = tokenMints.join(',');
    const jupiterRes = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
    if (jupiterRes.ok) {
      const jupiterData = await jupiterRes.json();
      for (const mint of tokenMints) {
        if (jupiterData.data?.[mint]?.price) {
          prices[mint] = parseFloat(jupiterData.data[mint].price);
        }
      }
    }
  } catch (e) {
    console.error('Jupiter price fetch failed:', e);
  }

  // Fallback to DexScreener for missing prices
  const missingMints = tokenMints.filter(m => !prices[m]);
  for (const mint of missingMints) {
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData.pairs?.[0];
        if (pair?.priceUsd) {
          prices[mint] = parseFloat(pair.priceUsd);
        }
      }
    } catch (e) {
      console.error(`DexScreener fallback failed for ${mint}:`, e);
    }
  }

  return prices;
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    if (res.ok) {
      const data = await res.json();
      return parseFloat(data.data?.['So11111111111111111111111111111111111111112']?.price || '150');
    }
  } catch (e) {
    console.error('SOL price fetch failed:', e);
  }
  return 150; // fallback
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { slippageBps = 500, priorityFeeMode = 'medium' } = body;

    const results = {
      prices: {} as Record<string, number>,
      bondingCurveData: {} as Record<string, number>,
      checkedAt: new Date().toISOString(),
      priceMonitor: { checked: 0, executed: [] as string[] },
      rebuyMonitor: { checked: 0, executed: [] as string[] },
      emergencyMonitor: { checked: 0, executed: [] as string[] },
      limitOrderMonitor: { checked: 0, executed: [] as string[], expired: 0 },
    };

    // 1. Fetch all holding positions
    const { data: holdingPositions, error: posErr } = await supabase
      .from('flip_positions')
      .select('*')
      .eq('status', 'holding');

    if (posErr) {
      console.error('Failed to fetch holding positions:', posErr);
    }

    // 2. Fetch rebuy-watching positions (sold but waiting for rebuy)
    const { data: rebuyPositions, error: rebuyErr } = await supabase
      .from('flip_positions')
      .select('*')
      .eq('rebuy_status', 'watching');

    if (rebuyErr) {
      console.error('Failed to fetch rebuy positions:', rebuyErr);
    }

    // 3. Fetch active limit orders
    const { data: limitOrders, error: limitErr } = await supabase
      .from('flip_limit_orders')
      .select('*')
      .eq('status', 'watching')
      .gt('expires_at', new Date().toISOString());

    if (limitErr) {
      console.error('Failed to fetch limit orders:', limitErr);
    }

    // Mark expired limit orders
    const { data: expiredOrders } = await supabase
      .from('flip_limit_orders')
      .update({ status: 'expired' })
      .eq('status', 'watching')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    results.limitOrderMonitor.expired = expiredOrders?.length || 0;

    // Collect all unique token mints we need prices for
    const allMints = new Set<string>();
    
    (holdingPositions || []).forEach(p => allMints.add(p.token_mint));
    (rebuyPositions || []).forEach(p => allMints.add(p.token_mint));
    (limitOrders || []).forEach(o => allMints.add(o.token_mint));

    // Fetch all prices in one batch
    const prices = await fetchTokenPrices(Array.from(allMints));
    const solPrice = await fetchSolPrice();
    results.prices = prices;

    // 4. Check price targets for holding positions
    results.priceMonitor.checked = holdingPositions?.length || 0;
    
    for (const pos of holdingPositions || []) {
      const currentPrice = prices[pos.token_mint];
      if (!currentPrice) continue;

      // Check if target reached (simplified - full logic in flipit-price-monitor)
      if (pos.target_price_usd && currentPrice >= pos.target_price_usd) {
        console.log(`[Unified] Position ${pos.id} hit target: ${currentPrice} >= ${pos.target_price_usd}`);
        // Note: We don't execute here - that's handled by flipit-price-monitor
        // This unified monitor is just for price updates
      }

      // Check emergency sell
      if (pos.emergency_sell_status === 'watching' && pos.emergency_sell_price_usd) {
        results.emergencyMonitor.checked++;
        if (currentPrice <= pos.emergency_sell_price_usd) {
          console.log(`[Unified] Position ${pos.id} hit emergency sell: ${currentPrice} <= ${pos.emergency_sell_price_usd}`);
          // Trigger emergency sell via the dedicated function
          try {
            const { error: emergencyErr } = await supabase.functions.invoke('flipit-emergency-monitor');
            if (!emergencyErr) {
              results.emergencyMonitor.executed.push(pos.id);
            }
          } catch (e) {
            console.error('Emergency sell trigger failed:', e);
          }
        }
      }
    }

    // 5. Check rebuy conditions
    results.rebuyMonitor.checked = rebuyPositions?.length || 0;
    
    for (const pos of rebuyPositions || []) {
      const currentPrice = prices[pos.token_mint];
      if (!currentPrice) continue;

      const lowPrice = pos.rebuy_price_low_usd || pos.rebuy_price_usd;
      const highPrice = pos.rebuy_price_high_usd || pos.rebuy_price_usd;

      if (lowPrice && highPrice && currentPrice >= lowPrice && currentPrice <= highPrice) {
        console.log(`[Unified] Position ${pos.id} rebuy triggered: ${lowPrice} <= ${currentPrice} <= ${highPrice}`);
        // Trigger rebuy via dedicated function
        try {
          const { error: rebuyFnErr } = await supabase.functions.invoke('flipit-rebuy-monitor');
          if (!rebuyFnErr) {
            results.rebuyMonitor.executed.push(pos.id);
          }
        } catch (e) {
          console.error('Rebuy trigger failed:', e);
        }
      }
    }

    // 6. Check limit orders
    results.limitOrderMonitor.checked = limitOrders?.length || 0;
    
    for (const order of limitOrders || []) {
      const currentPrice = prices[order.token_mint];
      if (!currentPrice) continue;

      if (currentPrice >= order.buy_price_min_usd && currentPrice <= order.buy_price_max_usd) {
        console.log(`[Unified] Limit order ${order.id} triggered: ${order.buy_price_min_usd} <= ${currentPrice} <= ${order.buy_price_max_usd}`);
        // Trigger limit order via dedicated function
        try {
          const { error: limitFnErr } = await supabase.functions.invoke('flipit-limit-order-monitor');
          if (!limitFnErr) {
            results.limitOrderMonitor.executed.push(order.id);
          }
        } catch (e) {
          console.error('Limit order trigger failed:', e);
        }
      }
    }

    return ok({
      success: true,
      ...results,
      summary: {
        totalPricesFetched: Object.keys(prices).length,
        holdingPositions: holdingPositions?.length || 0,
        rebuyWatching: rebuyPositions?.length || 0,
        limitOrdersActive: limitOrders?.length || 0,
        solPrice,
      }
    });

  } catch (error: any) {
    console.error('Unified monitor error:', error);
    return bad(error.message || 'Internal error', 500);
  }
});
