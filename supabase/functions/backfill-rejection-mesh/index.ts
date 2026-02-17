import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { feedRejectionToMesh, hasMeshWorthyReasons } from '../_shared/rejection-mesh.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 100;
    const offset = body.offset || 0;

    // Fetch rejected tokens with mesh-worthy reasons that have creator wallets
    const { data: rejectedTokens, error } = await supabase
      .from('pumpfun_watchlist')
      .select('id, token_mint, token_symbol, token_name, creator_wallet, rejection_reason, rejection_reasons, status, metadata, bundle_score, rugcheck_normalised, holder_count, market_cap_usd, bump_bot_detected')
      .in('status', ['rejected', 'dead', 'bombed'])
      .not('creator_wallet', 'is', null)
      .order('removed_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    if (!rejectedTokens || rejectedTokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No more tokens to backfill',
        processed: 0,
        meshed: 0,
        skipped: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let meshed = 0;
    let skipped = 0;

    for (const token of rejectedTokens) {
      const reasons = token.rejection_reasons || 
        (token.rejection_reason ? token.rejection_reason.split(', ') : []);
      
      if (!hasMeshWorthyReasons(reasons)) {
        skipped++;
        continue;
      }

      try {
        await feedRejectionToMesh(supabase, {
          token_mint: token.token_mint,
          token_symbol: token.token_symbol,
          token_name: token.token_name,
          creator_wallet: token.creator_wallet,
          rejection_reasons: reasons,
          bundle_score: token.bundle_score,
          rugcheck_score: token.rugcheck_normalised,
          holder_count: token.holder_count,
          market_cap_usd: token.market_cap_usd,
          bump_bot_detected: token.bump_bot_detected,
          source: 'backfill',
        });
        meshed++;
      } catch (e) {
        console.error(`[backfill] Error meshing ${token.token_mint}: ${e}`);
      }

      // Small delay to avoid overwhelming the DB
      if (meshed % 10 === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const hasMore = rejectedTokens.length === batchSize;

    return new Response(JSON.stringify({
      success: true,
      processed: rejectedTokens.length,
      meshed,
      skipped,
      next_offset: hasMore ? offset + batchSize : null,
      message: hasMore 
        ? `Processed ${meshed} tokens. Call again with offset=${offset + batchSize} for next batch.`
        : `Backfill complete. Meshed ${meshed} tokens, skipped ${skipped} cosmetic rejections.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[backfill] Fatal error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
