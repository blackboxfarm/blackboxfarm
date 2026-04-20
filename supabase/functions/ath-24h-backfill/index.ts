import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * ATH 24h Backfill
 * 
 * Processes tokens in token_lifecycle that have no ath_24h_usd yet,
 * newest to oldest, with rate limiting for GeckoTerminal (30 req/min free tier).
 * 
 * Params (POST body):
 *   batchSize: number of tokens per run (default 10, max 50)
 */

async function fetchAth24h(tokenMint: string): Promise<number | null> {
  try {
    // Step 1: Find the top pool
    const poolsRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools?page=1`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!poolsRes.ok) {
      console.warn(`[ath-backfill] Pools lookup failed for ${tokenMint}: ${poolsRes.status}`);
      return null;
    }

    const poolsData = await poolsRes.json();
    const pools = poolsData?.data;

    if (!pools || pools.length === 0) return null;

    const poolAddress = pools[0]?.attributes?.address;
    if (!poolAddress) return null;

    // Rate limit pause between the two API calls (GeckoTerminal free: 30 req/min)
    await new Promise(r => setTimeout(r, 6000));

    // Step 2: Fetch hourly OHLCV candles (24h window)
    const ohlcvRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/hour?aggregate=1&limit=24&currency=usd`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!ohlcvRes.ok) {
      console.warn(`[ath-backfill] OHLCV failed for ${tokenMint}: ${ohlcvRes.status}`);
      return null;
    }

    const ohlcvData = await ohlcvRes.json();
    const candles = ohlcvData?.data?.attributes?.ohlcv_list;

    if (!candles || candles.length === 0) return null;

    // OHLCV: [timestamp, open, high, low, close, volume]
    let maxHigh = 0;
    for (const candle of candles) {
      const high = Number(candle[2]);
      if (high > maxHigh) maxHigh = high;
    }

    return maxHigh > 0 ? maxHigh : null;
  } catch (err) {
    console.warn(`[ath-backfill] Error for ${tokenMint}:`, err);
    return null;
  }
}

Deno.serve(withRunLog('ath-24h-backfill', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders }
  if (!await isFunctionEnabled('ath-24h-backfill')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(body.batchSize || 50, 1), 50);

    // Get tokens without ath_24h_usd, newest first
    const { data: tokens, error: fetchError } = await supabase
      .from('token_lifecycle')
      .select('token_mint, first_seen_at')
      .is('ath_24h_usd', null)
      .order('first_seen_at', { ascending: false })
      .limit(batchSize);

    if (fetchError) throw fetchError;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to backfill', processed: 0, remaining: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count remaining for progress reporting
    const { count: remaining } = await supabase
      .from('token_lifecycle')
      .select('token_mint', { count: 'exact', head: true })
      .is('ath_24h_usd', null);

    let enriched = 0;
    let skipped = 0;
    const results: { mint: string; ath: number | null }[] = [];

    for (const token of tokens) {
      const ath = await fetchAth24h(token.token_mint);

      if (ath !== null) {
        const { error: updateError } = await supabase
          .from('token_lifecycle')
          .update({ ath_24h_usd: ath })
          .eq('token_mint', token.token_mint);

        if (!updateError) {
          enriched++;
          console.log(`[ath-backfill] ✅ ${token.token_mint} → $${ath}`);
        } else {
          console.warn(`[ath-backfill] DB update failed for ${token.token_mint}:`, updateError.message);
        }
      } else {
        // Mark as 0 so we don't re-process tokens with no pool data
        await supabase
          .from('token_lifecycle')
          .update({ ath_24h_usd: 0 })
          .eq('token_mint', token.token_mint);
        skipped++;
      }

      results.push({ mint: token.token_mint, ath });

      // 15 seconds between each token to safely respect GeckoTerminal rate limits
      await new Promise(r => setTimeout(r, 15000));
    }

    console.log(`[ath-backfill] Batch done: ${enriched} enriched, ${skipped} skipped, ~${(remaining ?? 0) - tokens.length} remaining`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: tokens.length,
        enriched,
        skipped,
        remaining: Math.max(0, (remaining ?? 0) - tokens.length),
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[ath-backfill] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));

