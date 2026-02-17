import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Calculate false positive score (0-100) */
function calcFalsePositiveScore(data: {
  isGraduated: boolean;
  athBondingCurvePct: number;
  currentHolders: number;
  peakMarketCapUsd: number;
  currentPriceUsd: number;
}): number {
  let score = 0;
  if (data.isGraduated) score += 40;
  if (data.athBondingCurvePct > 80) score += 20;
  else if (data.athBondingCurvePct > 50) score += 10;
  if (data.currentHolders > 100) score += 15;
  else if (data.currentHolders > 50) score += 8;
  if (data.peakMarketCapUsd > 50000) score += 15;
  else if (data.peakMarketCapUsd > 10000) score += 8;
  if (data.currentPriceUsd > 0) score += 10;
  return Math.min(score, 100);
}

/** Estimate bonding curve % from market cap. Pump.fun graduation ~$69k mcap */
function estimateBondingCurvePct(marketCapUsd: number): number {
  const GRADUATION_MCAP = 69000;
  if (marketCapUsd <= 0) return 0;
  if (marketCapUsd >= GRADUATION_MCAP) return 100;
  return Math.round((marketCapUsd / GRADUATION_MCAP) * 100);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 25;
    const maxBatches = body.max_batches || 20;
    const offset = body.offset || 0;

    console.log(`[backcheck] Starting: batch_size=${batchSize}, max_batches=${maxBatches}, offset=${offset}`);

    // Fetch rejected tokens not yet checked or oldest-checked first
    const { data: rejected, error: fetchErr } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, token_name, image_url, rejection_reason, rejection_type, rejected_at, creator_wallet')
      .not('rejection_reason', 'is', null)
      .not('rejection_reason', 'ilike', '%mayhem%')
      .neq('was_spiked_and_killed', true)
      .order('rejected_at', { ascending: false })
      .range(offset, offset + (batchSize * maxBatches) - 1);

    if (fetchErr) {
      console.error('[backcheck] Fetch error:', fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!rejected || rejected.length === 0) {
      return new Response(JSON.stringify({ message: 'No rejected tokens to process', processed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[backcheck] Found ${rejected.length} tokens to process`);

    let processed = 0;
    let errors = 0;
    let falsePositivesFound = 0;

    // Process in batches
    for (let b = 0; b < maxBatches && b * batchSize < rejected.length; b++) {
      const batch = rejected.slice(b * batchSize, (b + 1) * batchSize);

      for (const token of batch) {
        try {
          // Rate limit: 300ms between API calls
          if (processed > 0) {
            await new Promise(r => setTimeout(r, 300));
          }

          // Fetch from DexScreener
          const dexRes = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${token.token_mint}`,
            { signal: AbortSignal.timeout(5000) }
          );

          let isGraduated = false;
          let currentPriceUsd = 0;
          let currentMarketCapUsd = 0;
          let peakMarketCapUsd = 0;
          let athPriceUsd = 0;
          let currentHolders = 0;
          let volume24h = 0;
          let graduatedAt: string | null = null;

          if (dexRes.ok) {
            const dexData = await dexRes.json();
            const pairs = dexData.pairs || [];

            if (pairs.length > 0) {
              // Has pairs on DEX = graduated
              const raydiumPair = pairs.find((p: any) => p.dexId === 'raydium');
              if (raydiumPair) {
                isGraduated = true;
                graduatedAt = raydiumPair.pairCreatedAt || null;
              }

              // Get best price/mcap across all pairs
              for (const pair of pairs) {
                const price = parseFloat(pair.priceUsd) || 0;
                const mcap = pair.marketCap || pair.fdv || 0;
                const vol = pair.volume?.h24 || 0;

                if (price > currentPriceUsd) currentPriceUsd = price;
                if (mcap > currentMarketCapUsd) currentMarketCapUsd = mcap;
                if (mcap > peakMarketCapUsd) peakMarketCapUsd = mcap;
                if (price > athPriceUsd) athPriceUsd = price;
                if (vol > volume24h) volume24h = vol;
              }
            }
          }

          const athBondingCurvePct = isGraduated ? 100 : estimateBondingCurvePct(peakMarketCapUsd);

          const fpScore = calcFalsePositiveScore({
            isGraduated,
            athBondingCurvePct,
            currentHolders,
            peakMarketCapUsd,
            currentPriceUsd,
          });

          const wasFalsePositive = isGraduated || fpScore >= 40;
          if (wasFalsePositive) falsePositivesFound++;

          // Upsert into backcheck table
          const { error: upsertErr } = await supabase
            .from('pumpfun_rejected_backcheck')
            .upsert({
              token_mint: token.token_mint,
              token_symbol: token.token_symbol,
              token_name: token.token_name,
              image_url: token.image_url,
              rejection_reason: token.rejection_reason,
              rejection_type: token.rejection_type,
              rejected_at: token.rejected_at,
              creator_wallet: token.creator_wallet,
              ath_price_usd: athPriceUsd,
              ath_bonding_curve_pct: athBondingCurvePct,
              current_price_usd: currentPriceUsd,
              current_market_cap_usd: currentMarketCapUsd,
              is_graduated: isGraduated,
              graduated_at: graduatedAt,
              current_holders: currentHolders,
              current_volume_24h_usd: volume24h,
              peak_market_cap_usd: peakMarketCapUsd,
              was_false_positive: wasFalsePositive,
              false_positive_score: fpScore,
              checked_at: new Date().toISOString(),
              check_count: 1, // Will be incremented by SQL on conflict
            }, { onConflict: 'token_mint' });

          if (upsertErr) {
            console.error(`[backcheck] Upsert error for ${token.token_mint}:`, upsertErr.message);
            errors++;
          } else {
            processed++;
          }
        } catch (tokenErr) {
          console.error(`[backcheck] Token error ${token.token_mint}:`, (tokenErr as Error).message);
          errors++;
        }
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      processed,
      errors,
      falsePositivesFound,
      totalAvailable: rejected.length,
      durationMs: duration,
    };

    console.log(`[backcheck] Complete:`, result);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[backcheck] Fatal error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
