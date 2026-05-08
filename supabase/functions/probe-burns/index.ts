/**
 * probe-burns
 * Counts burn events for a token via Solscan transfer activity_type=ACTIVITY_SPL_BURN.
 * Writes burn_events_count and burn_amount_total into token_lifecycle.metadata.
 */
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SOLSCAN_KEY = Deno.env.get("SOLSCAN_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token_mint, lookback_pages = 2 } = await req.json();
    if (!token_mint) return json({ error: "token_mint required" }, 400);
    if (!SOLSCAN_KEY) return json({ error: "SOLSCAN_API_KEY missing" }, 500);

    let burn_events_count = 0;
    let burn_amount_total = 0;
    const evidence: string[] = [];
    for (let page = 1; page <= lookback_pages; page++) {
      const url = `https://pro-api.solscan.io/v2.0/token/transfer?address=${token_mint}&activity_type[]=ACTIVITY_SPL_BURN&page=${page}&page_size=40&sort_by=block_time&sort_order=desc`;
      const r = await fetch(url, { headers: { token: SOLSCAN_KEY }, signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!r || !r.ok) break;
      const j = await r.json().catch(() => null);
      const items = j?.data ?? [];
      if (!Array.isArray(items) || !items.length) break;
      for (const t of items) {
        burn_events_count += 1;
        burn_amount_total += Number(t?.amount ?? 0);
        if (t?.trans_id) evidence.push(t.trans_id);
      }
      if (items.length < 40) break;
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: lc } = await supa.from("token_lifecycle").select("metadata").eq("token_mint", token_mint).maybeSingle();
    const meta = { ...(lc?.metadata ?? {}), burn_events_count, burn_amount_total, burn_evidence: evidence.slice(0, 10) };
    await supa.from("token_lifecycle").update({ metadata: meta }).eq("token_mint", token_mint);

    return json({ ok: true, token_mint, burn_events_count, burn_amount_total, evidence: evidence.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}