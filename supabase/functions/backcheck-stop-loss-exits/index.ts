import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
    const forceRecheck = body.force_recheck === true;
    const batchSize = body.batch_size || 25;
    const maxBatches = body.max_batches || 20;

    const results: any[] = [];
    let recoveredCount = 0;
    let graduatedCount = 0;
    let rehabFlaggedCount = 0;
    let totalProcessed = 0;
    let batchesRun = 0;
    let hasMore = true;

    while (hasMore && batchesRun < maxBatches) {
      let query = supabase
        .from('pumpfun_fantasy_positions')
        .select('id, token_mint, token_symbol, entry_price_usd, entry_price_sol, exit_price_usd, exit_at, peak_multiplier, total_pnl_percent, entry_market_cap_usd, exit_reason, creator_wallet, rehabilitation_status')
        .eq('status', 'closed')
        .in('exit_reason', ['stop_loss', 'drawdown'])
        .order('exit_at', { ascending: false })
        .limit(batchSize);

      if (!forceRecheck) {
        query = query.is('post_exit_checked_at', null);
      }

      const { data: positions, error: posError } = await query;
      if (posError) throw posError;

      if (!positions || positions.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`[backcheck] Batch ${batchesRun + 1}: Processing ${positions.length} stop-loss exits`);

      for (const pos of positions) {
        try {
          let currentPriceUsd: number | null = null;
          let currentMcap: number | null = null;
          let graduated = false;

          // 1. Try Pump.fun API
          try {
            const bcResponse = await fetch(
              `https://frontend-api-v3.pump.fun/coins/${pos.token_mint}`,
              { headers: { 'Accept': 'application/json' } }
            );
            if (bcResponse.ok) {
              const bcData = await bcResponse.json();
              if (bcData) {
                graduated = bcData.complete === true || bcData.raydium_pool !== null;
                if (bcData.usd_market_cap) {
                  currentMcap = bcData.usd_market_cap;
                  currentPriceUsd = bcData.usd_market_cap / 1_000_000_000;
                }
              }
            }
          } catch (e) {
            // silent
          }

          // 2. Fallback to DexScreener for graduated tokens
          if (graduated || !currentPriceUsd) {
            try {
              const dexResp = await fetch(
                `https://api.dexscreener.com/latest/dex/tokens/${pos.token_mint}`
              );
              if (dexResp.ok) {
                const dexData = await dexResp.json();
                if (dexData.pairs && dexData.pairs.length > 0) {
                  const pair = dexData.pairs[0];
                  currentPriceUsd = parseFloat(pair.priceUsd) || null;
                  currentMcap = pair.marketCap || pair.fdv || null;
                  graduated = true;
                }
              }
            } catch (e) {
              // silent
            }
          }

          const entryPrice = pos.entry_price_usd || 0;
          const postExitMultiplier = entryPrice > 0 && currentPriceUsd
            ? currentPriceUsd / entryPrice
            : null;
          const recovered = postExitMultiplier !== null && postExitMultiplier >= 1.0;

          if (recovered) recoveredCount++;
          if (graduated) graduatedCount++;

          // Build update payload
          const updatePayload: any = {
            post_exit_price_usd: currentPriceUsd,
            post_exit_mcap: currentMcap,
            post_exit_graduated: graduated,
            post_exit_recovered: recovered,
            post_exit_multiplier_vs_entry: postExitMultiplier,
            post_exit_checked_at: new Date().toISOString(),
          };

          // Flag for rehabilitation review if recovered or graduated
          const shouldFlagForRehab = (recovered || graduated) &&
            (!pos.rehabilitation_status || pos.rehabilitation_status === 'none');

          if (shouldFlagForRehab) {
            updatePayload.rehabilitation_status = 'pending_review';
            rehabFlaggedCount++;

            // Insert rehabilitation_candidate into reputation_mesh
            if (pos.creator_wallet) {
              const evidence: Record<string, any> = {
                source: 'backcheck-stop-loss-exits',
                exit_reason: pos.exit_reason,
                post_exit_multiplier: postExitMultiplier,
                graduated,
                recovered,
                post_exit_mcap: currentMcap,
                checked_at: new Date().toISOString(),
              };

              if (postExitMultiplier) {
                evidence.summary = graduated
                  ? `Token graduated after ${pos.exit_reason} exit, ${postExitMultiplier.toFixed(1)}x from entry`
                  : `Token recovered to ${postExitMultiplier.toFixed(1)}x after ${pos.exit_reason} exit`;
              }

              await supabase.from('reputation_mesh').upsert({
                source_id: pos.creator_wallet,
                source_type: 'wallet',
                linked_id: pos.token_mint,
                linked_type: 'token',
                relationship: 'rehabilitation_candidate',
                confidence: Math.min(1.0, (postExitMultiplier || 0) / 5),
                discovered_via: 'backcheck_stop_loss',
                evidence,
              }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });

              console.log(`[backcheck] Flagged ${pos.token_symbol} for rehab review (${postExitMultiplier?.toFixed(1)}x, graduated=${graduated})`);
            }
          }

          await supabase
            .from('pumpfun_fantasy_positions')
            .update(updatePayload)
            .eq('id', pos.id);

          results.push({
            id: pos.id,
            token_symbol: pos.token_symbol,
            post_exit_multiplier: postExitMultiplier,
            recovered,
            graduated,
            rehab_flagged: shouldFlagForRehab,
            verdict: recovered
              ? graduated
                ? '🚀 GRADUATED & RECOVERED'
                : `✅ Recovered ${postExitMultiplier?.toFixed(2)}x`
              : currentPriceUsd === null
                ? '💀 Dead'
                : `❌ ${postExitMultiplier?.toFixed(2)}x`,
          });

          totalProcessed++;

          // Rate limit: 300ms between API calls
          await new Promise(r => setTimeout(r, 300));
        } catch (posErr) {
          console.error(`[backcheck] Error ${pos.token_mint}: ${posErr}`);
          results.push({ id: pos.id, token_symbol: pos.token_symbol, verdict: '⚠️ Failed' });
          totalProcessed++;
        }
      }

      batchesRun++;
      hasMore = positions.length === batchSize;

      if (hasMore) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const summary = {
      total_checked: totalProcessed,
      batches_run: batchesRun,
      recovered: recoveredCount,
      graduated: graduatedCount,
      rehab_flagged: rehabFlaggedCount,
      still_down: totalProcessed - recoveredCount - results.filter(r => r.verdict?.includes('Failed')).length,
      has_more: hasMore,
      recovery_rate_pct: totalProcessed > 0 ? ((recoveredCount / totalProcessed) * 100).toFixed(1) : '0',
      insight: recoveredCount > totalProcessed * 0.3
        ? '⚠️ HIGH RECOVERY RATE - Consider loosening stop-loss'
        : recoveredCount > totalProcessed * 0.1
        ? '📊 Some recovered - Consider selective hold strategies'
        : '✅ Stop-loss working well - Most stayed dead',
    };

    console.log(`[backcheck] Done: ${JSON.stringify(summary)}`);

    return jsonResponse({ success: true, summary, results });
  } catch (err) {
    console.error('[backcheck] Fatal error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
