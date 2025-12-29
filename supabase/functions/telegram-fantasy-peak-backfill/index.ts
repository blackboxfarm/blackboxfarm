import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FantasyPosition {
  id: string;
  token_mint: string;
  entry_price_usd: number;
  created_at: string;
  target_sell_multiplier: number | null;
}

interface DexScreenerPair {
  priceUsd: string;
  priceChange: {
    h24?: number;
  };
  volume: {
    h24?: number;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

async function fetchHistoricalPeak(tokenMint: string, entryDate: string): Promise<{ peakPrice: number | null; peakAt: string | null }> {
  try {
    // Try Birdeye first for historical data
    const birdeyeKey = Deno.env.get('BIRDEYE_API_KEY');
    if (birdeyeKey) {
      const entryTime = new Date(entryDate).getTime() / 1000;
      const now = Math.floor(Date.now() / 1000);
      
      // Get OHLCV data from entry date to now (daily candles)
      const url = `https://public-api.birdeye.so/defi/ohlcv?address=${tokenMint}&type=1D&time_from=${Math.floor(entryTime)}&time_to=${now}`;
      
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': birdeyeKey,
          'x-chain': 'solana'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data?.items?.length > 0) {
          // Find the highest high price
          let peakPrice = 0;
          let peakAt = '';
          
          for (const candle of data.data.items) {
            if (candle.h > peakPrice) {
              peakPrice = candle.h;
              peakAt = new Date(candle.unixTime * 1000).toISOString();
            }
          }
          
          if (peakPrice > 0) {
            return { peakPrice, peakAt };
          }
        }
      }
    }
    
    // Fallback: Use DexScreener for current price as baseline
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexResponse.ok) {
      const data: DexScreenerResponse = await dexResponse.json();
      if (data.pairs && data.pairs.length > 0) {
        const currentPrice = parseFloat(data.pairs[0].priceUsd);
        // For tokens with high 24h gains, estimate a higher peak
        const priceChange24h = data.pairs[0].priceChange?.h24 || 0;
        
        // If price dropped significantly in 24h, the peak was likely higher
        if (priceChange24h < -20) {
          // Estimate peak based on 24h change
          const estimatedPeak = currentPrice / (1 + priceChange24h / 100);
          return { 
            peakPrice: Math.max(currentPrice, estimatedPeak), 
            peakAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() // ~12h ago estimate
          };
        }
        
        return { peakPrice: currentPrice, peakAt: new Date().toISOString() };
      }
    }
    
    return { peakPrice: null, peakAt: null };
  } catch (error) {
    console.error(`Error fetching peak for ${tokenMint}:`, error);
    return { peakPrice: null, peakAt: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { positionId } = await req.json().catch(() => ({}));

    // Fetch positions that need peak backfill
    let query = supabase
      .from('telegram_fantasy_positions')
      .select('id, token_mint, entry_price_usd, created_at, target_sell_multiplier')
      .is('peak_price_usd', null);

    if (positionId) {
      query = query.eq('id', positionId);
    }

    const { data: positions, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    if (!positions || positions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No positions need backfill', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Backfilling peaks for ${positions.length} positions`);

    const updates: Array<{
      id: string;
      peakPrice: number;
      peakAt: string;
      peakMultiplier: number;
      wouldHaveSold: boolean;
      targetMultiplier: number;
    }> = [];

    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < positions.length; i += batchSize) {
      const batch = positions.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (position: FantasyPosition) => {
        const { peakPrice, peakAt } = await fetchHistoricalPeak(position.token_mint, position.created_at);
        
        if (peakPrice && position.entry_price_usd > 0) {
          const peakMultiplier = peakPrice / position.entry_price_usd;
          const targetMult = position.target_sell_multiplier || 2.0;
          const wouldHaveSold = peakMultiplier >= targetMult;
          
          // Update the position
          const { error: updateError } = await supabase
            .from('telegram_fantasy_positions')
            .update({
              peak_price_usd: peakPrice,
              peak_price_at: peakAt,
              peak_multiplier: peakMultiplier
            })
            .eq('id', position.id);

          if (!updateError) {
            updates.push({
              id: position.id,
              peakPrice,
              peakAt: peakAt!,
              peakMultiplier,
              wouldHaveSold,
              targetMultiplier: targetMult
            });
          }
        }
      }));

      // Small delay between batches
      if (i + batchSize < positions.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const missedOpportunities = updates.filter(u => u.wouldHaveSold);

    return new Response(
      JSON.stringify({
        success: true,
        totalProcessed: positions.length,
        updated: updates.length,
        missedOpportunities: missedOpportunities.length,
        details: updates.map(u => ({
          id: u.id,
          peakMultiplier: u.peakMultiplier.toFixed(2) + 'x',
          targetMultiplier: u.targetMultiplier + 'x',
          wouldHaveSold: u.wouldHaveSold,
          peakAt: u.peakAt
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Peak backfill error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
