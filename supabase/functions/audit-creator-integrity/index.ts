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
    const { batchSize = 100, offset = 0, table = 'scraped_tokens' } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Query pump.fun tokens that have a creator_wallet set
    let query;
    if (table === 'scraped_tokens') {
      query = supabase
        .from('scraped_tokens')
        .select('token_mint, creator_wallet, launchpad')
        .not('creator_wallet', 'is', null)
        .or('launchpad.eq.pump.fun,token_mint.like.%pump')
        .range(offset, offset + batchSize - 1);
    } else if (table === 'token_lifecycle') {
      query = supabase
        .from('token_lifecycle')
        .select('token_mint, creator_wallet')
        .not('creator_wallet', 'is', null)
        .like('token_mint', '%pump')
        .range(offset, offset + batchSize - 1);
    } else if (table === 'developer_tokens') {
      query = supabase
        .from('developer_tokens')
        .select('token_mint, creator_wallet')
        .not('creator_wallet', 'is', null)
        .like('token_mint', '%pump')
        .range(offset, offset + batchSize - 1);
    } else if (table === 'pumpfun_watchlist') {
      query = supabase
        .from('pumpfun_watchlist')
        .select('token_mint, creator_wallet')
        .not('creator_wallet', 'is', null)
        .like('token_mint', '%pump')
        .range(offset, offset + batchSize - 1);
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid table. Use: scraped_tokens, token_lifecycle, developer_tokens, pumpfun_watchlist' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { data: tokens, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tokens found in range', matches: 0, mismatches: 0, errors: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Auditing ${tokens.length} pump.fun tokens from ${table} (offset ${offset})...`);

    let matches = 0;
    let mismatches = 0;
    let errors = 0;
    let unreachable = 0;
    const mismatchDetails: any[] = [];

    for (const token of tokens) {
      try {
        const pumpResponse = await fetch(
          `https://frontend-api.pump.fun/coins/${token.token_mint}`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (!pumpResponse.ok) {
          unreachable++;
          continue;
        }

        const pumpData = await pumpResponse.json();
        const realCreator = pumpData.creator;

        if (!realCreator) {
          unreachable++;
          continue;
        }

        if (token.creator_wallet === realCreator) {
          matches++;
        } else {
          mismatches++;
          mismatchDetails.push({
            token_mint: token.token_mint,
            stored_creator: token.creator_wallet,
            real_creator: realCreator,
            stored_is_program: token.creator_wallet?.startsWith('TSLvdd') || token.creator_wallet?.startsWith('6EF8r') || false,
          });
        }

        await delay(200); // Rate limiting for pump.fun API
      } catch (error) {
        errors++;
        console.error(`Error auditing ${token.token_mint}:`, error);
      }
    }

    const contamination_rate = tokens.length > 0 
      ? ((mismatches / (matches + mismatches)) * 100).toFixed(2)
      : '0';

    const report = {
      table,
      offset,
      batch_size: batchSize,
      total_checked: tokens.length,
      matches,
      mismatches,
      unreachable,
      errors,
      contamination_rate: `${contamination_rate}%`,
      sample_mismatches: mismatchDetails.slice(0, 20),
    };

    console.log(`Audit complete: ${matches} correct, ${mismatches} wrong (${contamination_rate}% contaminated), ${unreachable} unreachable`);

    return new Response(
      JSON.stringify(report),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in audit-creator-integrity:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
