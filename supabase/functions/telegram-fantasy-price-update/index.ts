import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch token prices in batch from Jupiter
async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  if (tokenMints.length === 0) return prices;
  
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
            prices[mint] = parseFloat(data.data[mint].price);
          }
        }
      }
    }
  } catch (error) {
    console.error('[telegram-fantasy-price-update] Error fetching Jupiter prices:', error);
  }
  
  // Fallback to DexScreener for missing prices
  const missingMints = tokenMints.filter(m => !prices[m]);
  for (const mint of missingMints) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await response.json();
      if (data.pairs?.[0]?.priceUsd) {
        prices[mint] = parseFloat(data.pairs[0].priceUsd);
      }
    } catch (error) {
      console.error(`[telegram-fantasy-price-update] Error fetching DexScreener price for ${mint}:`, error);
    }
  }
  
  return prices;
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
    const { action, positionId } = body;

    // Get open fantasy positions
    let query = supabase
      .from('telegram_fantasy_positions')
      .select('*')
      .eq('status', 'open');

    if (positionId) {
      query = query.eq('id', positionId);
    }

    const { data: positions, error: fetchError } = await query;

    if (fetchError) {
      console.error('[telegram-fantasy-price-update] Error fetching positions:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch fantasy positions'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No open fantasy positions',
        updated: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];
    console.log(`[telegram-fantasy-price-update] Fetching prices for ${tokenMints.length} tokens`);

    // Fetch current prices
    const prices = await fetchTokenPrices(tokenMints);
    console.log(`[telegram-fantasy-price-update] Got prices for ${Object.keys(prices).length} tokens`);

    // Update each position
    let updatedCount = 0;
    const updates: any[] = [];

    for (const position of positions) {
      const currentPrice = prices[position.token_mint];
      
      if (currentPrice !== undefined) {
        const entryPrice = position.entry_price_usd;
        const entryAmount = position.entry_amount_usd;
        
        // Calculate current value and PnL
        const tokenAmount = position.token_amount || (entryPrice > 0 ? entryAmount / entryPrice : 0);
        const currentValue = tokenAmount * currentPrice;
        const pnlUsd = currentValue - entryAmount;
        const pnlPercent = entryAmount > 0 ? ((currentValue - entryAmount) / entryAmount) * 100 : 0;

        const { error: updateError } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            current_price_usd: currentPrice,
            unrealized_pnl_usd: pnlUsd,
            unrealized_pnl_percent: pnlPercent
          })
          .eq('id', position.id);

        if (!updateError) {
          updatedCount++;
          updates.push({
            id: position.id,
            token: position.token_symbol,
            entryPrice: entryPrice,
            currentPrice: currentPrice,
            pnlUsd: pnlUsd.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2)
          });
        }
      }
    }

    console.log(`[telegram-fantasy-price-update] Updated ${updatedCount} positions`);

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      totalPositions: positions.length,
      updates,
      timestamp: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[telegram-fantasy-price-update] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
