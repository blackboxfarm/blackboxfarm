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

type PostExitOutcome = 'dev_rugged_post_exit' | 'died_after_profit' | 'graduated' | 'continued_runner' | 'stable';

function classifyPostExitOutcome(
  exitPriceUsd: number,
  postExitPriceUsd: number | null,
  postExitGraduated: boolean,
  devSold: boolean
): PostExitOutcome {
  if (!postExitPriceUsd || postExitPriceUsd <= 0) return 'died_after_profit';

  const postExitRatio = postExitPriceUsd / exitPriceUsd;

  // Dev rugged: price crashed >80% from exit AND dev sold
  if (devSold && postExitRatio < 0.2) return 'dev_rugged_post_exit';

  // Died: dropped below 50% of exit price
  if (postExitRatio < 0.5) return 'died_after_profit';

  // Graduated: completed bonding curve (use pump.fun `complete` flag only)
  if (postExitGraduated) return 'graduated';

  // Continued runner: 3x+ beyond exit
  if (postExitRatio > 3.0) return 'continued_runner';

  // Stable
  return 'stable';
}

async function feedbackWinReputation(
  supabase: any,
  creatorWallet: string,
  tokenMint: string,
  tokenSymbol: string,
  outcome: PostExitOutcome,
  postExitMultiplier: number | null
): Promise<string> {
  const now = new Date().toISOString();
  const isNegative = outcome === 'dev_rugged_post_exit' || outcome === 'died_after_profit';
  const isPositive = outcome === 'graduated' || outcome === 'continued_runner';

  if (!isNegative && !isPositive) return 'no_change';

  // 1. Upsert dev_wallet_reputation
  const { data: existing } = await supabase
    .from('dev_wallet_reputation')
    .select('id, fantasy_loss_count, fantasy_win_count, tokens_rugged, tokens_successful, trust_level, auto_blacklisted')
    .eq('wallet_address', creatorWallet)
    .maybeSingle();

  if (existing) {
    const updates: any = { updated_at: now, last_activity_at: now };

    if (isNegative) {
      if (outcome === 'dev_rugged_post_exit') {
        updates.tokens_rugged = (existing.tokens_rugged || 0) + 1;
      }
      updates.fantasy_loss_count = (existing.fantasy_loss_count || 0) + 1;
      updates.last_fantasy_loss_at = now;
    } else {
      updates.fantasy_win_count = (existing.fantasy_win_count || 0) + 1;
      updates.tokens_successful = (existing.tokens_successful || 0) + 1;
      updates.last_fantasy_win_at = now;
    }

    // Re-classify trust level
    const newRugCount = updates.tokens_rugged ?? existing.tokens_rugged ?? 0;
    const newLossCount = updates.fantasy_loss_count ?? existing.fantasy_loss_count ?? 0;
    const newWinCount = updates.fantasy_win_count ?? existing.fantasy_win_count ?? 0;

    if (newRugCount >= 3 || (newLossCount >= 5 && newWinCount === 0)) {
      updates.trust_level = 'serial_rugger';
    } else if (newRugCount >= 2 || (newLossCount >= 3 && newWinCount === 0)) {
      updates.trust_level = 'repeat_loser';
    }

    await supabase.from('dev_wallet_reputation').update(updates).eq('id', existing.id);

    // Auto-blacklist check
    const shouldBlacklist = !existing.auto_blacklisted && (
      newRugCount >= 2 ||
      (newLossCount >= 3 && newWinCount === 0) ||
      newLossCount >= 5
    );

    if (shouldBlacklist) {
      const { data: existingBl } = await supabase
        .from('pumpfun_blacklist')
        .select('id')
        .eq('identifier', creatorWallet)
        .maybeSingle();

      if (!existingBl) {
        await supabase.from('pumpfun_blacklist').insert({
          entry_type: 'wallet',
          identifier: creatorWallet,
          risk_level: newRugCount >= 2 ? 'critical' : 'high',
          blacklist_reason: `Auto-blacklisted (post-exit backcheck): ${newLossCount} losses, ${newRugCount} rugs`,
          tags: ['auto_classified', 'profit_exit_backcheck', outcome === 'dev_rugged_post_exit' ? 'post_exit_rugger' : 'post_exit_death'],
          evidence_notes: `Token: ${tokenSymbol} (${tokenMint}). Post-exit outcome: ${outcome}`,
          source: 'backcheck-profit-exits',
          added_by: 'system_auto',
          is_active: true,
          auto_classified: true,
          linked_wallets: [creatorWallet],
          linked_token_mints: [tokenMint],
        });

        await supabase.from('dev_wallet_reputation')
          .update({ auto_blacklisted: true, auto_blacklisted_at: now })
          .eq('id', existing.id);

        console.log(`🚫 AUTO-BLACKLISTED (post-exit): ${creatorWallet.slice(0, 8)}...`);
        return 'blacklisted';
      }
    }
  } else {
    // Create new reputation entry
    await supabase.from('dev_wallet_reputation').insert({
      wallet_address: creatorWallet,
      total_tokens_launched: 1,
      tokens_rugged: outcome === 'dev_rugged_post_exit' ? 1 : 0,
      tokens_successful: isPositive ? 1 : 0,
      fantasy_loss_count: isNegative ? 1 : 0,
      fantasy_win_count: isPositive ? 1 : 0,
      trust_level: outcome === 'dev_rugged_post_exit' ? 'suspicious' : 'unknown',
      reputation_score: outcome === 'dev_rugged_post_exit' ? 20 : (isPositive ? 65 : 35),
      first_seen_at: now,
      last_activity_at: now,
    });
  }

  // 2. Insert into reputation_mesh
  const meshRelationship = isNegative
    ? (outcome === 'dev_rugged_post_exit' ? 'created_rug_token' : 'created_loss_token')
    : 'created_successful_token';

  await supabase.from('reputation_mesh').upsert({
    source_type: 'wallet',
    source_id: creatorWallet,
    linked_type: 'token_mint',
    linked_id: tokenMint,
    relationship: meshRelationship,
    confidence: isNegative ? (outcome === 'dev_rugged_post_exit' ? 95 : 70) : Math.min(95, 50 + (postExitMultiplier || 1) * 5),
    evidence: {
      outcome,
      post_exit_multiplier: postExitMultiplier,
      token_symbol: tokenSymbol,
      source: 'backcheck-profit-exits',
      recorded_at: now,
    },
    discovered_via: 'backcheck-profit-exits',
  }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });

  return isNegative ? 'negative' : 'positive';
}

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
    let totalProcessed = 0;
    let batchesRun = 0;
    let hasMore = true;
    const outcomeStats = { continued_runner: 0, graduated: 0, stable: 0, died_after_profit: 0, dev_rugged_post_exit: 0 };
    let devFeedbackCount = 0;
    let creatorBackfillCount = 0;

    while (hasMore && batchesRun < maxBatches) {
      let query = supabase
        .from('pumpfun_fantasy_positions')
        .select('id, token_mint, token_symbol, entry_price_usd, exit_price_usd, exit_at, total_pnl_percent, exit_reason, creator_wallet, watchlist_id, peak_multiplier')
        .eq('status', 'closed')
        .gt('total_pnl_percent', 0)
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

      console.log(`[profit-backcheck] Batch ${batchesRun + 1}: Processing ${positions.length} profitable exits`);

      for (const pos of positions) {
        try {
          let creatorWallet = pos.creator_wallet;

          // Backfill creator_wallet from watchlist if missing
          if (!creatorWallet && pos.watchlist_id) {
            const { data: wl } = await supabase
              .from('pumpfun_watchlist')
              .select('creator_wallet')
              .eq('id', pos.watchlist_id)
              .maybeSingle();
            creatorWallet = wl?.creator_wallet || null;
            if (creatorWallet) creatorBackfillCount++;
          }

          // Also try by token_mint if still missing
          if (!creatorWallet) {
            const { data: wl } = await supabase
              .from('pumpfun_watchlist')
              .select('creator_wallet')
              .eq('token_mint', pos.token_mint)
              .maybeSingle();
            creatorWallet = wl?.creator_wallet || null;
            if (creatorWallet) creatorBackfillCount++;
          }

          let currentPriceUsd: number | null = null;
          let currentMcap: number | null = null;
          let graduated = false;
          let devSold = false;

          // 1. Pump.fun API (primary)
          try {
            const bcResponse = await fetch(
              `https://frontend-api-v3.pump.fun/coins/${pos.token_mint}`,
              { headers: { 'Accept': 'application/json' } }
            );
            if (bcResponse.ok) {
              const bcData = await bcResponse.json();
              if (bcData) {
                // Use ONLY the `complete` flag for graduation (not DexScreener fallback)
                graduated = bcData.complete === true;
                if (bcData.usd_market_cap) {
                  currentMcap = bcData.usd_market_cap;
                  currentPriceUsd = bcData.usd_market_cap / 1_000_000_000;
                }
              }
            }
          } catch (_e) { /* silent */ }

          // 2. DexScreener fallback for graduated tokens or missing price
          if (graduated || !currentPriceUsd) {
            try {
              const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pos.token_mint}`);
              if (dexResp.ok) {
                const dexData = await dexResp.json();
                if (dexData.pairs && dexData.pairs.length > 0) {
                  const pair = dexData.pairs[0];
                  currentPriceUsd = parseFloat(pair.priceUsd) || currentPriceUsd;
                  currentMcap = pair.marketCap || pair.fdv || currentMcap;
                  // Don't override graduated from DexScreener - only trust pump.fun `complete`
                }
              }
            } catch (_e) { /* silent */ }
          }

          // 3. Check dev_sold from watchlist
          if (creatorWallet) {
            const { data: wlCheck } = await supabase
              .from('pumpfun_watchlist')
              .select('dev_sold')
              .eq('token_mint', pos.token_mint)
              .maybeSingle();
            devSold = wlCheck?.dev_sold === true;
          }

          const exitPrice = pos.exit_price_usd || 0;
          const entryPrice = pos.entry_price_usd || 0;
          const postExitMultiplierVsEntry = entryPrice > 0 && currentPriceUsd
            ? currentPriceUsd / entryPrice
            : null;

          // Classify outcome
          const outcome = classifyPostExitOutcome(exitPrice, currentPriceUsd, graduated, devSold);
          outcomeStats[outcome]++;

          // Update position
          const updatePayload: any = {
            post_exit_price_usd: currentPriceUsd,
            post_exit_mcap: currentMcap,
            post_exit_graduated: graduated,
            post_exit_multiplier_vs_entry: postExitMultiplierVsEntry,
            post_exit_checked_at: new Date().toISOString(),
            post_exit_outcome: outcome,
          };

          if (creatorWallet && !pos.creator_wallet) {
            updatePayload.creator_wallet = creatorWallet;
          }

          await supabase.from('pumpfun_fantasy_positions').update(updatePayload).eq('id', pos.id);

          // Dev reputation feedback
          let devStatus = 'no_wallet';
          if (creatorWallet) {
            devStatus = await feedbackWinReputation(
              supabase, creatorWallet, pos.token_mint, pos.token_symbol, outcome, postExitMultiplierVsEntry
            );
            if (devStatus !== 'no_change') devFeedbackCount++;
          }

          const exitRatio = exitPrice > 0 && currentPriceUsd ? (currentPriceUsd / exitPrice) : null;

          results.push({
            id: pos.id,
            token_symbol: pos.token_symbol,
            exit_price: exitPrice,
            current_price: currentPriceUsd,
            post_exit_ratio: exitRatio?.toFixed(2),
            post_exit_multiplier_vs_entry: postExitMultiplierVsEntry?.toFixed(2),
            graduated,
            outcome,
            dev_status: devStatus,
            verdict: outcome === 'continued_runner' ? `🚀 ${postExitMultiplierVsEntry?.toFixed(1)}x`
              : outcome === 'graduated' ? '🎓 Graduated'
              : outcome === 'stable' ? `📊 Stable ${exitRatio?.toFixed(1)}x`
              : outcome === 'dev_rugged_post_exit' ? '💀 Dev Rugged'
              : `📉 Died ${exitRatio?.toFixed(2)}x`,
          });

          totalProcessed++;
          await new Promise(r => setTimeout(r, 300));
        } catch (posErr) {
          console.error(`[profit-backcheck] Error ${pos.token_mint}: ${posErr}`);
          results.push({ id: pos.id, token_symbol: pos.token_symbol, verdict: '⚠️ Failed' });
          totalProcessed++;
        }
      }

      batchesRun++;
      hasMore = positions.length === batchSize;
      if (hasMore) await new Promise(r => setTimeout(r, 1000));
    }

    const summary = {
      total_checked: totalProcessed,
      batches_run: batchesRun,
      has_more: hasMore,
      outcomes: outcomeStats,
      dev_feedback_applied: devFeedbackCount,
      creator_wallets_backfilled: creatorBackfillCount,
      insight: outcomeStats.continued_runner > totalProcessed * 0.2
        ? '🚀 HIGH RUNNER RATE - Consider moonbag or hold-longer strategies'
        : outcomeStats.dev_rugged_post_exit > totalProcessed * 0.3
        ? '⚠️ HIGH RUG RATE POST-EXIT - Many devs rugging after our sell'
        : outcomeStats.graduated > totalProcessed * 0.1
        ? '🎓 Some graduated - Consider hold-to-graduate strategy'
        : '✅ Most tokens stable or died after our exit',
    };

    console.log(`[profit-backcheck] Done: ${JSON.stringify(summary)}`);
    return jsonResponse({ success: true, summary, results });
  } catch (err) {
    console.error('[profit-backcheck] Fatal error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
