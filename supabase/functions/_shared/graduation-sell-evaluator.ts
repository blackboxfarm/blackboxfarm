// Graduation Sell Evaluator
// ---------------------------------------------------------------
// Captures the post-bonding-curve "graduation candle" on Raydium.
//
// Flow:
//   disabled -> (bonding_curve_progress >= trigger_pct) -> armed_pre_grad
//   armed_pre_grad -> (token migrated to Raydium) -> watching_post_grad
//   watching_post_grad -> sell when ANY of:
//     (a) capture_x >= max_capture_pct/100        (hard ceiling)
//     (b) drop from peak >= trail_drop_pct AND price > arming_price (trailing peak protection)
//     (c) price < arming_price * (1 - min_capture_pct/100)         (graduation dump floor)
//
// This module is pure logic + DB updates + invokes flipit-execute. It does
// NOT throw on transient issues (price not available yet); it throws hard on
// DB write failures (per zero-tolerance-silent-fails rule).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface GradSellPosition {
  id: string;
  token_mint: string;
  token_symbol?: string | null;
  status: string;
  bonding_curve_progress: number | null;
  is_on_curve: boolean | null;
  graduation_sell_enabled: boolean;
  graduation_sell_trigger_pct: number;
  graduation_sell_max_capture_pct: number;
  graduation_sell_min_capture_pct: number;
  graduation_sell_trail_drop_pct: number;
  graduation_sell_slippage_bps: number;
  graduation_sell_status: string; // disabled | armed_pre_grad | watching_post_grad | executed | failed
  graduation_sell_armed_at?: string | null;
  graduation_sell_arming_price_usd?: number | null;
  graduation_sell_peak_price_usd?: number | null;
  // Per-position execution-speed overrides (nullable → fall back to global flipit_settings)
  graduation_sell_priority_fee_mode?: string | null;
  graduation_sell_priority_fee_micro_lamports?: number | null;
  graduation_sell_jito_tip_lamports?: number | null;
  // Moonbag: % of position to KEEP after grad sell fires (0–50). null/0 = sell 100%.
  graduation_sell_moonbag_pct?: number | null;
  // Linked sell-group: positions sharing this id are sold together.
  sell_group_id?: string | null;
  quantity_tokens?: number | null;
}

export interface GradSellPriceMeta {
  price: number;
  source?: string; // 'pumpfun_curve' | 'dexscreener' | 'jupiter' | ...
  isOnCurve?: boolean;
  bondingCurveProgress?: number;
}

export interface GradSellResult {
  positionId: string;
  action: "armed" | "watching" | "executed" | "noop" | "failed";
  reason?: string;
  signature?: string;
}

function isMigratedToRaydium(meta: GradSellPriceMeta | undefined, pos: GradSellPosition): boolean {
  // Multiple signals — any one is enough.
  if (meta?.source && meta.source !== "pumpfun_curve" && meta.isOnCurve === false) return true;
  if (meta?.isOnCurve === false) return true;
  if (pos.is_on_curve === false) return true;
  // Source explicitly indicates Raydium/Jupiter (post-grad routes)
  if (meta?.source === "dexscreener" || meta?.source === "jupiter" || meta?.source === "raydium") {
    return true;
  }
  return false;
}

async function dbUpdateOrThrow(
  supabase: SupabaseClient,
  positionId: string,
  patch: Record<string, unknown>,
  context: string
): Promise<void> {
  const { error } = await supabase
    .from("flip_positions")
    .update(patch)
    .eq("id", positionId);
  if (error) {
    throw new Error(`graduation-sell ${context} update failed for ${positionId}: ${error.message}`);
  }
}

export async function evaluateGraduationSell(
  supabase: SupabaseClient,
  pos: GradSellPosition,
  currentPrice: number | undefined,
  priceMeta: GradSellPriceMeta | undefined
): Promise<GradSellResult> {
  if (!pos.graduation_sell_enabled) {
    return { positionId: pos.id, action: "noop", reason: "disabled" };
  }
  if (pos.status !== "holding") {
    return { positionId: pos.id, action: "noop", reason: `status=${pos.status}` };
  }
  if (
    pos.graduation_sell_status === "executed" ||
    pos.graduation_sell_status === "failed"
  ) {
    return { positionId: pos.id, action: "noop", reason: `terminal=${pos.graduation_sell_status}` };
  }

  const nowIso = new Date().toISOString();

  // Always update last_eval_at so the UI/operator can see liveness.
  // Done as part of larger updates below to avoid an extra round-trip when possible.

  // ---- Stage 1: arm pre-graduation ----
  if (pos.graduation_sell_status === "disabled") {
    const progress = pos.bonding_curve_progress ?? priceMeta?.bondingCurveProgress ?? 0;
    if (progress >= pos.graduation_sell_trigger_pct) {
      const armingPrice = currentPrice && currentPrice > 0 ? currentPrice : null;
      await dbUpdateOrThrow(
        supabase,
        pos.id,
        {
          graduation_sell_status: "armed_pre_grad",
          graduation_sell_armed_at: nowIso,
          graduation_sell_arming_price_usd: armingPrice,
          graduation_sell_peak_price_usd: armingPrice,
          graduation_sell_last_eval_at: nowIso,
        },
        "arm"
      );
      console.log(
        `[grad-sell] ${pos.id} ${pos.token_symbol ?? pos.token_mint.slice(0, 8)} ARMED pre-grad ` +
          `at ${progress.toFixed(2)}% / arming_price=${armingPrice ?? "n/a"}`
      );
      return { positionId: pos.id, action: "armed", reason: `bc=${progress.toFixed(2)}%` };
    }
    // Still below trigger — just touch eval timestamp.
    await dbUpdateOrThrow(supabase, pos.id, { graduation_sell_last_eval_at: nowIso }, "tick");
    return { positionId: pos.id, action: "noop", reason: "below-trigger" };
  }

  // ---- Stage 2: armed_pre_grad — wait for migration ----
  if (pos.graduation_sell_status === "armed_pre_grad") {
    if (isMigratedToRaydium(priceMeta, pos)) {
      const peak = currentPrice && currentPrice > 0
        ? Math.max(currentPrice, pos.graduation_sell_peak_price_usd ?? 0)
        : (pos.graduation_sell_peak_price_usd ?? null);
      // If we never captured an arming price, use current as a fallback so the math still works.
      const armingPrice =
        pos.graduation_sell_arming_price_usd && pos.graduation_sell_arming_price_usd > 0
          ? pos.graduation_sell_arming_price_usd
          : currentPrice ?? null;
      await dbUpdateOrThrow(
        supabase,
        pos.id,
        {
          graduation_sell_status: "watching_post_grad",
          graduation_sell_arming_price_usd: armingPrice,
          graduation_sell_peak_price_usd: peak,
          graduation_sell_last_eval_at: nowIso,
        },
        "transition-to-watching"
      );
      console.log(
        `[grad-sell] ${pos.id} ${pos.token_symbol ?? ""} migrated → watching_post_grad ` +
          `(arming=${armingPrice ?? "n/a"}, peak=${peak ?? "n/a"})`
      );
      return { positionId: pos.id, action: "watching", reason: "migrated" };
    }
    await dbUpdateOrThrow(supabase, pos.id, { graduation_sell_last_eval_at: nowIso }, "tick");
    return { positionId: pos.id, action: "noop", reason: "awaiting-migration" };
  }

  // ---- Stage 3: watching_post_grad — peak-trail / cap / dump-floor ----
  if (pos.graduation_sell_status === "watching_post_grad") {
    if (!currentPrice || currentPrice <= 0) {
      await dbUpdateOrThrow(supabase, pos.id, { graduation_sell_last_eval_at: nowIso }, "tick");
      return { positionId: pos.id, action: "noop", reason: "no-price" };
    }

    const armingPrice = pos.graduation_sell_arming_price_usd ?? currentPrice;
    const prevPeak = pos.graduation_sell_peak_price_usd ?? armingPrice;
    const newPeak = Math.max(prevPeak, currentPrice);

    const captureX = currentPrice / armingPrice;
    const dropFromPeakPct = newPeak > 0 ? ((newPeak - currentPrice) / newPeak) * 100 : 0;
    const maxCaptureX = pos.graduation_sell_max_capture_pct / 100;
    const minFloorPrice = armingPrice * (1 - pos.graduation_sell_min_capture_pct / 100);

    let trigger: string | null = null;
    if (captureX >= maxCaptureX) {
      trigger = `max-capture (${(captureX * 100).toFixed(1)}% of arming)`;
    } else if (
      dropFromPeakPct >= pos.graduation_sell_trail_drop_pct &&
      currentPrice > armingPrice
    ) {
      trigger = `trail-drop ${dropFromPeakPct.toFixed(1)}% from peak ${newPeak.toFixed(10)}`;
    } else if (
      pos.graduation_sell_min_capture_pct > 0 &&
      currentPrice < minFloorPrice
    ) {
      trigger = `dump-floor (${currentPrice.toFixed(10)} < ${minFloorPrice.toFixed(10)})`;
    }

    if (!trigger) {
      // Update peak + tick.
      await dbUpdateOrThrow(
        supabase,
        pos.id,
        {
          graduation_sell_peak_price_usd: newPeak,
          graduation_sell_last_eval_at: nowIso,
        },
        "peak-update"
      );
      return { positionId: pos.id, action: "noop", reason: "watching" };
    }

    // Resolve execution-speed + moonbag settings:
    // per-position override → global default → hard default.
    let globalDefaults: {
      mode: string;
      micro: number | null;
      jitoTip: number;
      moonbagPct: number;
    } = { mode: "turbo", micro: null, jitoTip: 1_000_000, moonbagPct: 0 };
    try {
      const { data: settingsRow } = await supabase
        .from("flipit_settings")
        .select(
          "graduation_sell_priority_fee_mode_default, graduation_sell_priority_fee_micro_lamports_default, graduation_sell_jito_tip_lamports_default, graduation_sell_moonbag_pct_default"
        )
        .maybeSingle();
      if (settingsRow) {
        globalDefaults = {
          mode: settingsRow.graduation_sell_priority_fee_mode_default ?? "turbo",
          micro: settingsRow.graduation_sell_priority_fee_micro_lamports_default ?? null,
          jitoTip: settingsRow.graduation_sell_jito_tip_lamports_default ?? 1_000_000,
          moonbagPct: settingsRow.graduation_sell_moonbag_pct_default ?? 0,
        };
      }
    } catch (e) {
      console.warn(`[grad-sell] could not load global defaults:`, e);
    }

    const feeMode =
      pos.graduation_sell_priority_fee_mode ?? globalDefaults.mode ?? "turbo";
    const feeMicro =
      pos.graduation_sell_priority_fee_micro_lamports ?? globalDefaults.micro ?? null;
    const jitoTip =
      pos.graduation_sell_jito_tip_lamports ?? globalDefaults.jitoTip ?? 1_000_000;
    const moonbagPctRaw =
      pos.graduation_sell_moonbag_pct ?? globalDefaults.moonbagPct ?? 0;
    const moonbagPct = Math.max(0, Math.min(50, Number(moonbagPctRaw) || 0));
    const sellPercent = 100 - moonbagPct; // 100 = full sell, e.g. 80 if moonbag=20

    // ---- Build the list of positions to fire on (sell-group fanout) ----
    // If this position is in a sell_group, fan out to all 'holding' members and
    // execute the same logic on each. Each member is its own on-chain holding;
    // we send one tx per row but reuse the same trigger reason and exec params.
    let groupMembers: Array<{ id: string; token_symbol?: string | null }> = [
      { id: pos.id, token_symbol: pos.token_symbol },
    ];
    if (pos.sell_group_id) {
      const { data: members, error: gErr } = await supabase
        .from("flip_positions")
        .select("id, token_symbol, status")
        .eq("sell_group_id", pos.sell_group_id)
        .eq("status", "holding");
      if (gErr) {
        console.warn(
          `[grad-sell] failed to load sell_group ${pos.sell_group_id}:`,
          gErr.message
        );
      } else if (members && members.length > 0) {
        groupMembers = members.map((m: any) => ({ id: m.id, token_symbol: m.token_symbol }));
        console.log(
          `[grad-sell] group ${pos.sell_group_id}: firing on ${groupMembers.length} linked positions`
        );
      }
    }

    console.log(
      `[grad-sell] ${pos.id} ${pos.token_symbol ?? ""} FIRING SELL — ${trigger} ` +
        `(arming=${armingPrice}, peak=${newPeak}, current=${currentPrice}, ` +
        `slip=${pos.graduation_sell_slippage_bps}bps, feeMode=${feeMode}, ` +
        `feeMicro=${feeMicro ?? "preset"}, jitoTip=${jitoTip}, ` +
        `moonbagPct=${moonbagPct}, sellPct=${sellPercent}, members=${groupMembers.length})`
    );

    // Execute sells sequentially across group members (one tx per row).
    let triggerSignature: string | undefined;
    let triggerOk = false;
    const memberResults: Array<{ id: string; ok: boolean; signature?: string }> = [];
    for (const member of groupMembers) {
      try {
        const useAction = sellPercent < 100 ? "partial_sell" : "sell";
        const body: Record<string, unknown> = {
          action: useAction,
          positionId: member.id,
          slippageBps: pos.graduation_sell_slippage_bps,
          priorityFeeMode: feeMode,
          priorityFeeMicroLamports: feeMicro ?? undefined,
          jitoTipLamports: jitoTip,
          reason: `graduation_sell:${trigger}${pos.sell_group_id ? `:group:${pos.sell_group_id}` : ""}`,
        };
        if (useAction === "partial_sell") body.sellPercent = sellPercent;

        const { data: sellResult, error: sellErr } = await supabase.functions.invoke(
          "flipit-execute",
          { body }
        );
        const memberOk = !sellErr && !!sellResult?.success;
        const memberSig = sellResult?.signature ?? sellResult?.signatures?.[0];
        memberResults.push({ id: member.id, ok: memberOk, signature: memberSig });

        if (member.id === pos.id) {
          triggerOk = memberOk;
          triggerSignature = memberSig;
        }
        if (!memberOk) {
          console.error(
            `[grad-sell] sell invoke failed for ${member.id}:`,
            sellErr?.message ?? JSON.stringify(sellResult)
          );
        }
      } catch (e) {
        console.error(`[grad-sell] sell threw for ${member.id}:`, e);
        memberResults.push({ id: member.id, ok: false });
        if (member.id === pos.id) triggerOk = false;
      }
    }

    // Update each member row with its own outcome.
    for (const r of memberResults) {
      const newStatus = r.ok
        ? (moonbagPct > 0 ? "moonbag" : "executed")
        : "failed";
      const patch: Record<string, unknown> = {
        graduation_sell_status: r.ok ? "executed" : "failed",
        graduation_sell_executed_at: r.ok ? nowIso : null,
        graduation_sell_peak_price_usd: newPeak,
        graduation_sell_last_eval_at: nowIso,
        graduation_sell_sold_pct: r.ok ? sellPercent : null,
      };
      // If full sell succeeded → flip the position to executed (engine will close it).
      // If partial → keep as holding/moonbag for the retained tail.
      if (r.ok && moonbagPct === 0) {
        patch.status = "executed";
      } else if (r.ok && moonbagPct > 0) {
        patch.status = "moonbag";
        // Best-effort: derive retained quantity from on-position quantity.
        // The exact retained qty will be reconciled by the chain-sync job.
        // Note: pos.quantity_tokens only reflects the trigger row, not each member;
        // each member's row will be reconciled separately.
        if (typeof (pos as any).quantity_tokens === "number") {
          patch.graduation_sell_moonbag_qty_tokens =
            ((pos as any).quantity_tokens as number) * (moonbagPct / 100);
        }
      }
      await dbUpdateOrThrow(supabase, r.id, patch, "execute-result");
    }

    return {
      positionId: pos.id,
      action: triggerOk ? "executed" : "failed",
      reason: trigger,
      signature: triggerSignature,
    };
  }

  return { positionId: pos.id, action: "noop", reason: `unknown-status=${pos.graduation_sell_status}` };
}
