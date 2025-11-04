import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMints, batchSize = 50 } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch tokens that need enrichment
    let query = supabaseClient
      .from('scraped_tokens')
      .select('*')
      .or('metadata_fetched_at.is.null,creator_fetched_at.is.null')
      .limit(batchSize);

    if (tokenMints && Array.isArray(tokenMints) && tokenMints.length > 0) {
      query = query.in('token_mint', tokenMints);
    }

    const { data: tokens, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tokens need enrichment', enriched: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Enriching ${tokens.length} tokens...`);

    let enrichedCount = 0;
    const results = [];

    for (const token of tokens) {
      try {
        const updates: any = {};
        let needsUpdate = false;

        // Fetch metadata from DexScreener if missing
        if (!token.metadata_fetched_at || !token.symbol || !token.name) {
          try {
            const dexResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${token.token_mint}`
            );

            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pair = dexData.pairs?.[0];
              
              if (pair) {
                // Update symbol and name from baseToken
                if (!token.symbol && pair.baseToken?.symbol) {
                  updates.symbol = pair.baseToken.symbol;
                }
                if (!token.name && pair.baseToken?.name) {
                  updates.name = pair.baseToken.name;
                }
                if (!token.image_url && pair.info?.imageUrl) {
                  updates.image_url = pair.info.imageUrl;
                }
                if (pair.pairCreatedAt) {
                  updates.raydium_date = new Date(pair.pairCreatedAt).toISOString();
                }
                updates.metadata_fetched_at = new Date().toISOString();
                needsUpdate = true;
              }
            }
          } catch (error) {
            console.error(`Failed to fetch DexScreener data for ${token.token_mint}:`, error);
          }

          await delay(250); // Rate limiting
        }

        // Fetch creator wallet if missing
        if (!token.creator_wallet) {
          try {
            const creatorResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/solscan-creator-lookup`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
                },
                body: JSON.stringify({ tokenMint: token.token_mint })
              }
            );

            if (creatorResponse.ok) {
              const creatorData = await creatorResponse.json();
              if (creatorData.creatorWallet) {
                updates.creator_wallet = creatorData.creatorWallet;
                updates.creator_fetched_at = new Date().toISOString();
                needsUpdate = true;
              }
            }
          } catch (error) {
            console.error(`Failed to fetch creator for ${token.token_mint}:`, error);
          }

          await delay(250); // Rate limiting
        }

        // Update database if we have new data
        if (needsUpdate) {
          const { error: updateError } = await supabaseClient
            .from('scraped_tokens')
            .update(updates)
            .eq('token_mint', token.token_mint);

          if (!updateError) {
            enrichedCount++;
            results.push({
              token_mint: token.token_mint,
              success: true,
              updates
            });
          } else {
            console.error(`Failed to update ${token.token_mint}:`, updateError);
            results.push({
              token_mint: token.token_mint,
              success: false,
              error: updateError.message
            });
          }
        }

      } catch (error) {
        console.error(`Error enriching token ${token.token_mint}:`, error);
        results.push({
          token_mint: token.token_mint,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`Enrichment complete: ${enrichedCount}/${tokens.length} tokens updated`);

    return new Response(
      JSON.stringify({
        message: `Enriched ${enrichedCount} of ${tokens.length} tokens`,
        enriched: enrichedCount,
        total: tokens.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in enrich-scraped-tokens:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});