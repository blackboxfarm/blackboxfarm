import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  txns?: { h24?: { buys?: number; sells?: number } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[DexScreener] Fetching top 200 trending Solana tokens...');

    // Fetch trending pairs from DexScreener
    const response = await fetch(
      'https://api.dexscreener.com/latest/dex/tokens/trending?chainId=solana',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TokenGenealogyBot/1.0'
        }
      }
    );

    console.log(`[DexScreener] API Response Status: ${response.status}`);
    console.log(`[DexScreener] API Response Headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DexScreener] API error body:`, errorText);
      throw new Error(`DexScreener API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[DexScreener] Raw API response structure:`, JSON.stringify(data, null, 2));
    
    const pairs: DexScreenerPair[] = data.pairs || [];
    
    console.log(`[DexScreener] Found ${pairs.length} trending pairs`);
    if (pairs.length === 0) {
      console.warn('[DexScreener] WARNING: API returned 0 pairs. Full response:', JSON.stringify(data));
    }

    // Process top 200 (or however many are returned)
    const top200 = pairs.slice(0, 200);
    const capturedAt = new Date().toISOString();
    const newTokenMints = new Set<string>();
    const rankingsToInsert = [];

    for (let i = 0; i < top200.length; i++) {
      const pair = top200[i];
      const tokenMint = pair.baseToken.address;
      const rank = i + 1;

      // Prepare ranking record
      rankingsToInsert.push({
        token_mint: tokenMint,
        rank,
        trending_score: null, // DexScreener doesn't expose this directly
        market_cap: pair.marketCap || null,
        volume_24h: pair.volume?.h24 || null,
        price_usd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
        price_change_24h: pair.priceChange?.h24 || null,
        liquidity_usd: pair.liquidity?.usd || null,
        holder_count: null, // Not available from DexScreener
        captured_at: capturedAt,
        data_source: 'dexscreener',
        is_in_top_200: true,
        metadata: {
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          dexId: pair.dexId,
          pairAddress: pair.pairAddress,
          url: pair.url
        }
      });

      // Check if this is a new token in our lifecycle tracking
      const { data: existing } = await supabase
        .from('token_lifecycle')
        .select('token_mint')
        .eq('token_mint', tokenMint)
        .single();

      if (!existing) {
        newTokenMints.add(tokenMint);
      }
    }

    // Insert all rankings in batch
    const { error: rankingsError } = await supabase
      .from('token_rankings')
      .insert(rankingsToInsert);

    if (rankingsError) {
      console.error('[DexScreener] Error inserting rankings:', rankingsError);
      throw rankingsError;
    }

    console.log(`[DexScreener] Inserted ${rankingsToInsert.length} ranking records`);

    // Update token_lifecycle for all tracked tokens
    for (const record of rankingsToInsert) {
      const { data: lifecycle } = await supabase
        .from('token_lifecycle')
        .select('*')
        .eq('token_mint', record.token_mint)
        .single();

      if (lifecycle) {
        // Update existing lifecycle
        const updates: any = {
          last_seen_at: capturedAt,
          current_status: 'active',
        };

        if (!lifecycle.highest_rank || record.rank < lifecycle.highest_rank) {
          updates.highest_rank = record.rank;
        }
        if (!lifecycle.lowest_rank || record.rank > lifecycle.lowest_rank) {
          updates.lowest_rank = record.rank;
        }

        // Calculate hours in top 200 (rough estimate based on 5-min intervals)
        const hoursSinceLastSeen = 
          (new Date(capturedAt).getTime() - new Date(lifecycle.last_seen_at).getTime()) / (1000 * 60 * 60);
        updates.total_hours_in_top_200 = lifecycle.total_hours_in_top_200 + Math.min(hoursSinceLastSeen, 0.1);

        await supabase
          .from('token_lifecycle')
          .update(updates)
          .eq('token_mint', record.token_mint);
      } else {
        // Create new lifecycle record
        await supabase
          .from('token_lifecycle')
          .insert({
            token_mint: record.token_mint,
            first_seen_at: capturedAt,
            last_seen_at: capturedAt,
            highest_rank: record.rank,
            lowest_rank: record.rank,
            total_hours_in_top_200: 0,
            times_entered_top_200: 1,
            current_status: 'active',
            metadata: record.metadata
          });
      }
    }

    // Mark tokens that fell out of top 200
    const top200Mints = top200.map(p => p.baseToken.address);
    const { data: allActive } = await supabase
      .from('token_lifecycle')
      .select('token_mint')
      .eq('current_status', 'active');

    if (allActive) {
      for (const token of allActive) {
        if (!top200Mints.includes(token.token_mint)) {
          await supabase
            .from('token_lifecycle')
            .update({ 
              current_status: 'exited',
              last_seen_at: capturedAt
            })
            .eq('token_mint', token.token_mint);
        }
      }
    }

    // Trigger creator linking for new tokens
    if (newTokenMints.size > 0) {
      console.log(`[DexScreener] ${newTokenMints.size} new tokens to link to creators`);
      
      // Invoke token-creator-linker in background
      supabase.functions.invoke('token-creator-linker', {
        body: { tokenMints: Array.from(newTokenMints) }
      }).then(() => {
        console.log('[DexScreener] Creator linking triggered');
      }).catch(err => {
        console.error('[DexScreener] Error triggering creator linker:', err);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        capturedAt,
        tokensProcessed: top200.length,
        newTokens: newTokenMints.size,
        message: 'Top 200 rankings captured successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[DexScreener] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
