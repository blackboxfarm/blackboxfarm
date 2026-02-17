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

    // Get stop-loss exits that haven't been backchecked (or all if force)
    let query = supabase
      .from('pumpfun_fantasy_positions')
      .select('id, token_mint, token_symbol, entry_price_usd, entry_price_sol, exit_price_usd, exit_at, peak_multiplier, total_pnl_percent, entry_market_cap_usd, exit_reason')
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
      return jsonResponse({ 
        success: true, 
        message: 'No unchecked stop-loss exits found',
        checked: 0, 
        recovered: 0, 
        graduated: 0,
        results: [] 
      });
    }

    console.log(`[backcheck] Processing ${positions.length} stop-loss exits`);

    const results: any[] = [];
    let recoveredCount = 0;
    let graduatedCount = 0;

    // Process each position - check current bonding curve price
    for (const pos of positions) {
      try {
        let currentPriceUsd: number | null = null;
        let currentMcap: number | null = null;
        let graduated = false;

        // 1. Try bonding curve API first (Pump.fun)
        try {
          const bcResponse = await fetch(
            `https://frontend-api-v3.pump.fun/coins/${pos.token_mint}`,
            { headers: { 'Accept': 'application/json' } }
          );
          if (bcResponse.ok) {
            const bcData = await bcResponse.json();
            if (bcData) {
              graduated = bcData.complete === true || bcData.raydium_pool !== null;
              if (bcData.virtual_sol_reserves && bcData.virtual_token_reserves) {
                const priceSol = bcData.virtual_sol_reserves / bcData.virtual_token_reserves / 1e9;
                // Get SOL price for USD conversion
                currentMcap = bcData.market_cap || bcData.usd_market_cap || null;
                if (currentMcap && bcData.virtual_token_reserves) {
                  currentPriceUsd = currentMcap / 1e9; // rough estimate
                }
                // Better: use reserves directly
                if (bcData.virtual_sol_reserves && bcData.virtual_token_reserves) {
                  const solReserves = Number(bcData.virtual_sol_reserves);
                  const tokenReserves = Number(bcData.virtual_token_reserves);
                  if (tokenReserves > 0) {
                    const rawPriceSol = solReserves / tokenReserves;
                    // Try to get USD from mcap
                    currentMcap = bcData.usd_market_cap || bcData.market_cap || null;
                  }
                }
              }
              // Use usd_market_cap if available
              if (bcData.usd_market_cap) {
                currentMcap = bcData.usd_market_cap;
                // Derive price from mcap (total supply ~1B for pump.fun)
                currentPriceUsd = bcData.usd_market_cap / 1_000_000_000;
              }
            }
          }
        } catch (e) {
          console.log(`[backcheck] Pump.fun API failed for ${pos.token_mint}: ${e}`);
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
                graduated = true; // If on DEX, it graduated
              }
            }
          } catch (e) {
            console.log(`[backcheck] DexScreener failed for ${pos.token_mint}: ${e}`);
          }
        }

        // Calculate recovery metrics
        const entryPrice = pos.entry_price_usd || 0;
        const exitPrice = pos.exit_price_usd || 0;
        const postExitMultiplier = entryPrice > 0 && currentPriceUsd
          ? currentPriceUsd / entryPrice
          : null;
        const recovered = postExitMultiplier !== null && postExitMultiplier >= 1.0;

        if (recovered) recoveredCount++;
        if (graduated) graduatedCount++;

        // Update the position with backcheck results
        const { error: updateError } = await supabase
          .from('pumpfun_fantasy_positions')
          .update({
            post_exit_price_usd: currentPriceUsd,
            post_exit_mcap: currentMcap,
            post_exit_graduated: graduated,
            post_exit_recovered: recovered,
            post_exit_multiplier_vs_entry: postExitMultiplier,
            post_exit_checked_at: new Date().toISOString(),
          })
          .eq('id', pos.id);

        if (updateError) {
          console.error(`[backcheck] Update failed for ${pos.id}: ${updateError.message}`);
        }

        results.push({
          id: pos.id,
          token_symbol: pos.token_symbol,
          token_mint: pos.token_mint,
          entry_price_usd: entryPrice,
          exit_price_usd: exitPrice,
          current_price_usd: currentPriceUsd,
          current_mcap: currentMcap,
          post_exit_multiplier: postExitMultiplier,
          recovered,
          graduated,
          exit_reason: pos.exit_reason,
          verdict: recovered
            ? graduated
              ? '🚀 GRADUATED & RECOVERED - Should have held!'
              : `✅ Recovered to ${postExitMultiplier?.toFixed(2)}x entry`
            : currentPriceUsd === null
              ? '💀 Token dead / no price data'
              : `❌ Still down at ${postExitMultiplier?.toFixed(2)}x entry`,
        });

        // Rate limit - small delay between API calls
        await new Promise(r => setTimeout(r, 300));
      } catch (posErr) {
        console.error(`[backcheck] Error processing ${pos.token_mint}: ${posErr}`);
        results.push({
          id: pos.id,
          token_symbol: pos.token_symbol,
          token_mint: pos.token_mint,
          error: String(posErr),
          verdict: '⚠️ Check failed',
        });
      }
    }

    // Summary
    const summary = {
      total_checked: results.length,
      recovered: recoveredCount,
      graduated: graduatedCount,
      still_down: results.length - recoveredCount - results.filter(r => r.error).length,
      errors: results.filter(r => r.error).length,
      recovery_rate_pct: results.length > 0 ? ((recoveredCount / results.length) * 100).toFixed(1) : '0',
      insight: recoveredCount > results.length * 0.3
        ? '⚠️ HIGH RECOVERY RATE - Consider loosening stop-loss or adding a recovery window'
        : recoveredCount > results.length * 0.1
        ? '📊 Some tokens recovered - Consider selective hold strategies for high-quality tokens'
        : '✅ Stop-loss is working well - Most tokens stayed dead after exit',
    };

    console.log(`[backcheck] Summary: ${JSON.stringify(summary)}`);

    return jsonResponse({
      success: true,
      summary,
      results,
    });

  } catch (err) {
    console.error('[backcheck] Fatal error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
