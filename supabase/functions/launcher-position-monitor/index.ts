// Launcher Position Monitor — cron every 5s. For each holding, fetches current mcap;
// if >= entry * target_factor, sell. Force-exits past max_hold_seconds.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertUpdate } from "../_shared/db-assert.ts";
import { resolvePrice } from "../_shared/price-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const heliusKey = Deno.env.get("HELIUS_API_KEY") || undefined;

  const { data: holdings } = await sb.from("launcher_mint_events")
    .select("*, launcher_profiles!inner(id, name, launcher_trade_rules(*))")
    .eq("status", "holding")
    .limit(50);

  const results: any[] = [];
  for (const h of (holdings || [])) {
    const rule = (h as any).launcher_profiles?.launcher_trade_rules?.[0] || (h as any).launcher_profiles?.launcher_trade_rules;
    if (!rule) continue;
    try {
      const pr = await resolvePrice(h.mint_address, { heliusApiKey: heliusKey });
      const curPrice = pr?.price;
      if (!curPrice) continue;
      // Use price multiple — supply is constant so price multiple == mcap multiple
      const entryPrice = Number(h.entry_price_usd || 0);
      const target = Number(rule.target_factor || 2);
      const heldSecs = (Date.now() - new Date(h.buy_filled_at || h.detected_at).getTime()) / 1000;
      const hitTarget = entryPrice > 0 && curPrice >= entryPrice * target;
      const forceExit = heldSecs > Number(rule.max_hold_seconds || 3600);
      // Approximate mcap = price * 1B (pump.fun standard supply)
      const curMcap = curPrice * 1_000_000_000;
      const newHigh = Math.max(Number(h.highest_mcap_usd || 0), curMcap);
      await sb.from("launcher_mint_events").update({ highest_mcap_usd: newHigh }).eq("id", h.id);

      if (!hitTarget && !forceExit) continue;

      const { data: exec, error: exErr } = await sb.functions.invoke("flipit-execute", {
        body: {
          action: "sell",
          tokenMint: h.mint_address,
          walletId: rule.funding_wallet_id,
          slippageBps: Number(rule.slippage_bps),
          priorityFeeMode: "custom",
          customPriorityFee: Number(rule.priority_fee_lamports),
          jitoTipLamports: Number(rule.jito_tip_lamports),
          source: "launcher",
        },
      });
      if (exErr) throw exErr;
      const sig = exec?.signature || exec?.txSignature || exec?.signatures?.[0] || null;
      const exitPrice = curPrice;
      const exitMcap = curMcap;
      const multiple = entryPrice > 0 ? curPrice / entryPrice : null;
      await assertUpdate(
        sb.from("launcher_mint_events").update({
          status: sig ? "sold" : "failed",
          sell_tx_sig: sig,
          sell_filled_at: sig ? new Date().toISOString() : null,
          exit_mcap_usd: exitMcap,
          exit_price_usd: exitPrice,
          multiple_realized: multiple,
          skip_reason: forceExit ? "max_hold_seconds reached" : null,
        }).eq("id", h.id).select(),
        "launcher_mint_events"
      );
      results.push({ mint: h.mint_address, sig, multiple });
    } catch (e) {
      console.warn("[position-monitor]", h.mint_address, (e as Error).message);
    }
  }

  return ok({ checked: holdings?.length || 0, sells: results });
});