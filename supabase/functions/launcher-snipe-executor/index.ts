// Launcher Snipe Executor — applies pre-trade guards (fail-open), waits min_seconds_after_mint,
// then invokes flipit-execute to buy the detected mint with the launcher's flipit funding wallet.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const { mintEventId } = body;
  if (!mintEventId) return ok({ error: "missing mintEventId" }, 400);

  // Global kill switch
  const { data: kill } = await sb.from("launcher_global_kill_switch").select("killed").maybeSingle();
  if (kill?.killed) {
    await assertUpdate(
      sb.from("launcher_mint_events").update({ status: "skipped", skip_reason: "global kill switch" }).eq("id", mintEventId).select(),
      "launcher_mint_events"
    );
    return ok({ skipped: "kill switch" });
  }

  const { data: ev, error: evErr } = await sb
    .from("launcher_mint_events")
    .select("*, launcher_profiles!inner(id, name, launcher_trade_rules(*))")
    .eq("id", mintEventId)
    .maybeSingle();
  if (evErr || !ev) return ok({ error: evErr?.message || "event not found" }, 404);
  if (ev.status !== "detected") return ok({ skipped: `status=${ev.status}` });

  const rule = (ev as any).launcher_profiles?.launcher_trade_rules?.[0] || (ev as any).launcher_profiles?.launcher_trade_rules;
  if (!rule || !rule.enabled) {
    await assertUpdate(sb.from("launcher_mint_events").update({ status: "skipped", skip_reason: "rule disabled" }).eq("id", mintEventId).select(), "launcher_mint_events");
    return ok({ skipped: "rule disabled" });
  }
  if (!rule.funding_wallet_id) {
    await assertUpdate(sb.from("launcher_mint_events").update({ status: "skipped", skip_reason: "no funding wallet" }).eq("id", mintEventId).select(), "launcher_mint_events");
    return ok({ skipped: "no funding wallet" });
  }

  // Guards (fail-open: warn but never block per Security Guards Policy)
  if (rule.require_dev_buy_min_sol > 0 && (ev.dev_initial_buy_sol ?? 0) < Number(rule.require_dev_buy_min_sol)) {
    console.warn("[snipe] dev buy below threshold — fail-open, proceeding");
  }
  // Daily cap
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: spent } = await sb.from("launcher_mint_events")
    .select("buy_amount_sol")
    .eq("launcher_profile_id", ev.launcher_profile_id)
    .gte("buy_filled_at", since);
  const totalSpent = (spent || []).reduce((a: number, r: any) => a + Number(r.buy_amount_sol || 0), 0);
  if (totalSpent + Number(rule.buy_amount_sol) > Number(rule.max_daily_spend_sol)) {
    await assertUpdate(sb.from("launcher_mint_events").update({ status: "skipped", skip_reason: "daily cap reached" }).eq("id", mintEventId).select(), "launcher_mint_events");
    return ok({ skipped: "daily cap" });
  }

  // Wait window
  const waitMs = Math.max(0, Number(rule.min_seconds_after_mint || 0) * 1000);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

  // Invoke flipit-execute
  try {
    const { data: exec, error: exErr } = await sb.functions.invoke("flipit-execute", {
      body: {
        action: "buy",
        tokenMint: ev.mint_address,
        walletId: rule.funding_wallet_id,
        buyAmountSol: Number(rule.buy_amount_sol),
        slippageBps: Number(rule.slippage_bps),
        priorityFeeMode: "custom",
        customPriorityFee: Number(rule.priority_fee_lamports),
        jitoTipLamports: Number(rule.jito_tip_lamports),
        targetMultiplier: Number(rule.target_factor),
        source: "launcher",
      },
    });
    if (exErr) throw exErr;
    const sig = exec?.signature || exec?.txSignature || exec?.signatures?.[0] || null;
    await assertUpdate(
      sb.from("launcher_mint_events").update({
        status: sig ? "holding" : "failed",
        buy_tx_sig: sig,
        buy_filled_at: sig ? new Date().toISOString() : null,
        buy_amount_sol: sig ? Number(rule.buy_amount_sol) : null,
        entry_mcap_usd: exec?.entryMcapUsd || exec?.mcapUsd || null,
        entry_price_usd: exec?.entryPriceUsd || exec?.priceUsd || null,
        metadata: { ...(ev.metadata || {}), flipit_result: exec },
        skip_reason: sig ? null : "flipit returned no signature",
      }).eq("id", mintEventId).select(),
      "launcher_mint_events"
    );
    return ok({ ok: !!sig, signature: sig });
  } catch (e) {
    await assertUpdate(
      sb.from("launcher_mint_events").update({ status: "failed", skip_reason: `executor: ${(e as Error).message}` }).eq("id", mintEventId).select(),
      "launcher_mint_events"
    );
    return ok({ error: (e as Error).message }, 500);
  }
});