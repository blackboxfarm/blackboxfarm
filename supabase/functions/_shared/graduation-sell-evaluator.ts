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

    // Fire sell via flipit-execute (full position).
    console.log(
      `[grad-sell] ${pos.id} ${pos.token_symbol ?? ""} FIRING SELL — ${trigger} ` +
        `(arming=${armingPrice}, peak=${newPeak}, current=${currentPrice}, slip=${pos.graduation_sell_slippage_bps}bps)`
    );

    let signature: string | undefined;
    let sellOk = false;
    try {
      const { data: sellResult, error: sellErr } = await supabase.functions.invoke(
        "flipit-execute",
        {
          body: {
            action: "sell",
            positionId: pos.id,
            slippageBps: pos.graduation_sell_slippage_bps,
            priorityFeeMode: "high",
            reason: `graduation_sell:${trigger}`,
          },
        }
      );
      if (!sellErr && sellResult?.success) {
        signature = sellResult.signature ?? sellResult.signatures?.[0];
        sellOk = true;
      } else {
        console.error(
          `[grad-sell] sell invoke failed for ${pos.id}:`,
          sellErr?.message ?? JSON.stringify(sellResult)
        );
      }
    } catch (e) {
      console.error(`[grad-sell] sell threw for ${pos.id}:`, e);
    }

    await dbUpdateOrThrow(
      supabase,
      pos.id,
      {
        graduation_sell_status: sellOk ? "executed" : "failed",
        graduation_sell_executed_at: sellOk ? nowIso : null,
        graduation_sell_peak_price_usd: newPeak,
        graduation_sell_last_eval_at: nowIso,
      },
      "execute-result"
    );

    return {
      positionId: pos.id,
      action: sellOk ? "executed" : "failed",
      reason: trigger,
      signature,
    };
  }

  return { positionId: pos.id, action: "noop", reason: `unknown-status=${pos.graduation_sell_status}` };
}
