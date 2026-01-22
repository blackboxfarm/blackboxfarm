import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchDexScreenerData } from '../_shared/dexscreener-api.ts';

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

// Market data for volume/price change indicators
interface MarketData {
  price: number;
  priceChange5m?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  volume5m?: number;
  volume1h?: number;
  volume24h?: number;
  volumeSurgeRatio?: number; // 5m volume vs 1h average
}

// Fetch prices and market data from Jupiter with DexScreener fallback
async function fetchTokenPricesAndMarketData(tokenMints: string[]): Promise<{
  prices: Record<string, number>;
  marketData: Record<string, MarketData>;
}> {
  const prices: Record<string, number> = {};
  const marketData: Record<string, MarketData> = {};
  if (tokenMints.length === 0) return { prices, marketData };

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

  // Fetch from DexScreener for missing prices AND to get market data (volume, price changes)
  // DexScreener provides much richer data than Jupiter
  const mintsForDex = tokenMints.filter(m => !prices[m] || !marketData[m]);
  
  // Batch fetch for all tokens to get market data
  await Promise.all(tokenMints.map(async (mint) => {
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        // Sort by liquidity and get best pair
        const pairs = dexData.pairs || [];
        const sortedPairs = pairs.sort((a: any, b: any) => 
          (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0)
        );
        const pair = sortedPairs[0];
        
        if (pair) {
          // Set price if not already set
          if (!prices[mint] && pair.priceUsd) {
            prices[mint] = parseFloat(pair.priceUsd);
          }
          
          // Extract market data
          const volume5m = parseFloat(pair.volume?.m5) || 0;
          const volume1h = parseFloat(pair.volume?.h1) || 0;
          const volume24h = parseFloat(pair.volume?.h24) || 0;
          
          // Calculate volume surge ratio: 5m volume vs average 5m from 1h
          const avg5mFromHour = volume1h / 12;
          const volumeSurgeRatio = avg5mFromHour > 0 ? volume5m / avg5mFromHour : 0;
          
          marketData[mint] = {
            price: parseFloat(pair.priceUsd) || 0,
            priceChange5m: parseFloat(pair.priceChange?.m5) || 0,
            priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            volume5m,
            volume1h,
            volume24h,
            volumeSurgeRatio,
          };
        }
      }
    } catch (e) {
      console.error(`DexScreener fetch failed for ${mint}:`, e);
    }
  }));

  return { prices, marketData };
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.data?.['So11111111111111111111111111111111111111112']?.price || '0');
      if (price > 0) return price;
    }
  } catch (e) {
    console.error('Jupiter SOL price fetch failed:', e);
  }
  
  // Fallback to CoinGecko with API key authentication
  try {
    const apiKey = Deno.env.get('COINGECKO_API_KEY');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data?.solana?.usd) return data.solana.usd;
    }
  } catch (e) {
    console.error('CoinGecko SOL price failed:', e);
  }
  
  // NO FALLBACK - throw error instead of using fake price
  throw new Error('CRITICAL: All SOL price sources failed - cannot proceed with stale price');
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
    const { slippageBps = 500, priorityFeeMode = 'medium', refreshDexStatus = false } = body;

    const results = {
      prices: {} as Record<string, number>,
      marketData: {} as Record<string, MarketData>,
      bondingCurveData: {} as Record<string, number>,
      checkedAt: new Date().toISOString(),
      priceMonitor: { checked: 0, executed: [] as string[] },
      rebuyMonitor: { checked: 0, executed: [] as string[] },
      emergencyMonitor: { checked: 0, executed: [] as string[] },
      limitOrderMonitor: { checked: 0, executed: [] as string[], expired: 0 },
      stuckRecovery: { checked: 0, reset: [] as string[] },
      dexStatusRefresh: { checked: 0, updated: [] as string[] },
    };

    // 0. STUCK POSITION RECOVERY - Reset positions stuck in pending_sell/pending_buy for > 3 minutes
    const stuckThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 minutes ago
    
    const { data: stuckPositions, error: stuckErr } = await supabase
      .from('flip_positions')
      .select('id, status, token_symbol, updated_at')
      .in('status', ['pending_sell', 'pending_buy'])
      .lt('updated_at', stuckThreshold);

    if (stuckErr) {
      console.error('Failed to fetch stuck positions:', stuckErr);
    }

    results.stuckRecovery.checked = stuckPositions?.length || 0;

    for (const stuck of stuckPositions || []) {
      console.log(`[Unified] Resetting stuck position ${stuck.id} (${stuck.token_symbol}) from ${stuck.status} - stuck since ${stuck.updated_at}`);
      
      // Reset pending_sell back to holding, pending_buy to failed
      const newStatus = stuck.status === 'pending_sell' ? 'holding' : 'failed';
      
      const { error: resetErr } = await supabase
        .from('flip_positions')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString(),
          notes: `Auto-reset from ${stuck.status} after timeout at ${new Date().toISOString()}`
        })
        .eq('id', stuck.id)
        .eq('status', stuck.status); // Only update if still in same status

      if (!resetErr) {
        results.stuckRecovery.reset.push(`${stuck.id} (${stuck.token_symbol}): ${stuck.status} → ${newStatus}`);
      } else {
        console.error(`Failed to reset stuck position ${stuck.id}:`, resetErr);
      }
    }

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

    // Fetch all prices and market data in one batch
    const { prices, marketData } = await fetchTokenPricesAndMarketData(Array.from(allMints));
    const solPrice = await fetchSolPrice();
    results.prices = prices;
    results.marketData = marketData;

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

    // 7. Refresh DEX status and socials for holding positions (when requested)
    if (refreshDexStatus && holdingPositions && holdingPositions.length > 0) {
      console.log(`[Unified] Refreshing DEX status for ${holdingPositions.length} holding positions (parallel)`);
      results.dexStatusRefresh.checked = holdingPositions.length;
      
      // Parallelize DEX status refresh for faster response
      const dexRefreshPromises = holdingPositions.map(async (pos) => {
        try {
          const dexData = await fetchDexScreenerData(pos.token_mint);
          
          // Build update object
          const updateData: Record<string, unknown> = {
            dex_paid_status: {
              hasDexPaid: dexData.dexStatus.hasDexPaid,
              hasCTO: dexData.dexStatus.hasCTO,
              activeBoosts: dexData.dexStatus.activeBoosts,
              hasAds: dexData.dexStatus.hasAds,
              checkedAt: new Date().toISOString(),
            }
          };
          
          // Update socials if found
          if (dexData.socials.twitter) updateData.twitter_url = dexData.socials.twitter;
          if (dexData.socials.telegram) updateData.telegram_url = dexData.socials.telegram;
          if (dexData.socials.website) updateData.website_url = dexData.socials.website;
          
          const { error: updateErr } = await supabase
            .from('flip_positions')
            .update(updateData)
            .eq('id', pos.id);
          
          if (!updateErr) {
            console.log(`[Unified] Updated DEX status for ${pos.token_symbol}: CTO=${dexData.dexStatus.hasCTO}, DexPaid=${dexData.dexStatus.hasDexPaid}`);
            return { success: true, symbol: pos.token_symbol || pos.token_mint };
          }
          return { success: false, symbol: pos.token_symbol || pos.token_mint };
        } catch (e) {
          console.error(`[Unified] Failed to refresh DEX status for ${pos.token_mint}:`, e);
          return { success: false, symbol: pos.token_symbol || pos.token_mint };
        }
      });
      
      const dexResults = await Promise.allSettled(dexRefreshPromises);
      results.dexStatusRefresh.updated = dexResults
        .filter((r): r is PromiseFulfilledResult<{ success: boolean; symbol: string }> => 
          r.status === 'fulfilled' && r.value.success)
        .map(r => r.value.symbol);
    }

    return ok({
      success: true,
      ...results,
      summary: {
        totalPricesFetched: Object.keys(prices).length,
        holdingPositions: holdingPositions?.length || 0,
        rebuyWatching: rebuyPositions?.length || 0,
        limitOrdersActive: limitOrders?.length || 0,
        stuckPositionsReset: results.stuckRecovery.reset.length,
        dexStatusUpdated: results.dexStatusRefresh.updated.length,
        solPrice,
      }
    });

  } catch (error: any) {
    console.error('Unified monitor error:', error);
    return bad(error.message || 'Internal error', 500);
  }
});
