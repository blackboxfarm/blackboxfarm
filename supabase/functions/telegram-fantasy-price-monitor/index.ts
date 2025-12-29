import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  price: number;
  symbol: string | null;
}

interface FantasyPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  entry_price_usd: number;
  entry_amount_usd: number;
  token_amount: number | null;
  target_sell_multiplier: number | null;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean | null;
  is_active: boolean;
  status: string;
}

// Fetch token prices and symbols in batch from Jupiter + DexScreener
async function fetchTokenData(tokenMints: string[]): Promise<Record<string, TokenData>> {
  const tokenData: Record<string, TokenData> = {};
  
  if (tokenMints.length === 0) return tokenData;
  
  try {
    // Jupiter supports batching up to 100 tokens
    const batchSize = 100;
    for (let i = 0; i < tokenMints.length; i += batchSize) {
      const batch = tokenMints.slice(i, i + batchSize);
      const ids = batch.join(',');
      
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
      const data = await response.json();
      
      if (data.data) {
        for (const mint of batch) {
          if (data.data[mint]?.price) {
            tokenData[mint] = {
              price: parseFloat(data.data[mint].price),
              symbol: null
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('[telegram-fantasy-price-monitor] Error fetching Jupiter prices:', error);
  }
  
  // Use DexScreener for missing prices AND to get symbols
  const mintsNeedingData = tokenMints.filter(m => !tokenData[m] || !tokenData[m].symbol);
  for (const mint of mintsNeedingData) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await response.json();
      const pair = data.pairs?.[0];
      if (pair) {
        tokenData[mint] = {
          price: tokenData[mint]?.price || parseFloat(pair.priceUsd || '0'),
          symbol: pair.baseToken?.symbol || null
        };
      }
    } catch (error) {
      console.error(`[telegram-fantasy-price-monitor] Error fetching DexScreener data for ${mint}:`, error);
    }
  }
  
  return tokenData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[telegram-fantasy-price-monitor] Starting price monitor scan...');

    // Get ACTIVE open fantasy positions only
    const { data: positions, error: fetchError } = await supabase
      .from('telegram_fantasy_positions')
      .select('*')
      .eq('status', 'open')
      .eq('is_active', true);

    if (fetchError) {
      console.error('[telegram-fantasy-price-monitor] Error fetching positions:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch fantasy positions'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No active open fantasy positions',
        updated: 0,
        autoSold: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[telegram-fantasy-price-monitor] Found ${positions.length} active open positions`);

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];
    
    // Fetch current prices and symbols
    const tokenData = await fetchTokenData(tokenMints);
    console.log(`[telegram-fantasy-price-monitor] Got data for ${Object.keys(tokenData).length} tokens`);

    // Track results
    let updatedCount = 0;
    let autoSoldCount = 0;
    const autoSells: any[] = [];
    const updates: any[] = [];

    for (const position of positions as FantasyPosition[]) {
      const data = tokenData[position.token_mint];
      
      if (!data?.price) {
        console.log(`[telegram-fantasy-price-monitor] No price data for ${position.token_mint}`);
        continue;
      }

      const entryPrice = position.entry_price_usd;
      const entryAmount = position.entry_amount_usd;
      const tokenAmount = position.token_amount || (entryPrice > 0 ? entryAmount / entryPrice : 0);
      const currentValue = tokenAmount * data.price;
      const currentMultiplier = entryPrice > 0 ? data.price / entryPrice : 0;
      const targetMultiplier = position.target_sell_multiplier || 2.0;
      const stopLossPct = position.stop_loss_pct || 50;
      const stopLossEnabled = position.stop_loss_enabled !== false;

      // Calculate PnL
      const pnlUsd = currentValue - entryAmount;
      const pnlPercent = entryAmount > 0 ? ((currentValue - entryAmount) / entryAmount) * 100 : 0;

      // Check if target hit - AUTO SELL
      if (currentMultiplier >= targetMultiplier) {
        console.log(`[telegram-fantasy-price-monitor] TARGET HIT for ${position.token_symbol || position.token_mint}: ${currentMultiplier.toFixed(2)}x >= ${targetMultiplier}x`);
        
        const { error: sellError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_price_usd: data.price,
            current_price_usd: data.price,
            realized_pnl_usd: pnlUsd,
            realized_pnl_percent: pnlPercent,
            is_active: false,
            auto_sell_triggered: true,
            token_symbol: data.symbol || position.token_symbol
          })
          .eq('id', position.id);

        if (!sellError) {
          autoSoldCount++;
          autoSells.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            reason: 'target_hit',
            multiplier: currentMultiplier.toFixed(2),
            targetMultiplier: targetMultiplier,
            pnlUsd: pnlUsd.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2)
          });
        }
        continue;
      }

      // Check stop-loss - AUTO SELL
      if (stopLossEnabled && pnlPercent <= -stopLossPct) {
        console.log(`[telegram-fantasy-price-monitor] STOP LOSS for ${position.token_symbol || position.token_mint}: ${pnlPercent.toFixed(2)}% <= -${stopLossPct}%`);
        
        const { error: sellError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_price_usd: data.price,
            current_price_usd: data.price,
            realized_pnl_usd: pnlUsd,
            realized_pnl_percent: pnlPercent,
            is_active: false,
            auto_sell_triggered: true,
            token_symbol: data.symbol || position.token_symbol
          })
          .eq('id', position.id);

        if (!sellError) {
          autoSoldCount++;
          autoSells.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            reason: 'stop_loss',
            lossPercent: pnlPercent.toFixed(2),
            stopLossPct: stopLossPct,
            pnlUsd: pnlUsd.toFixed(2)
          });
        }
        continue;
      }

      // Regular update - just update prices
      const updateObj: Record<string, any> = {
        current_price_usd: data.price,
        unrealized_pnl_usd: pnlUsd,
        unrealized_pnl_percent: pnlPercent
      };
      
      if (data.symbol && !position.token_symbol) {
        updateObj.token_symbol = data.symbol;
      }

      const { error: updateError } = await supabase
        .from('telegram_fantasy_positions')
        .update(updateObj)
        .eq('id', position.id);

      if (!updateError) {
        updatedCount++;
        updates.push({
          id: position.id,
          token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
          currentPrice: data.price,
          multiplier: currentMultiplier.toFixed(2),
          targetMultiplier: targetMultiplier,
          progressToTarget: ((currentMultiplier / targetMultiplier) * 100).toFixed(1),
          pnlUsd: pnlUsd.toFixed(2),
          pnlPercent: pnlPercent.toFixed(2)
        });
      }
    }

    console.log(`[telegram-fantasy-price-monitor] Updated ${updatedCount} positions, auto-sold ${autoSoldCount}`);

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      autoSold: autoSoldCount,
      totalPositions: positions.length,
      updates,
      autoSells,
      timestamp: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[telegram-fantasy-price-monitor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
