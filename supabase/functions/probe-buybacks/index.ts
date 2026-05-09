/**
 * probe-buybacks
 * Detects post-graduation buy transactions FROM the dev wallet
 * targeting the token. Sums USD value into token_lifecycle.metadata.buybacks_usd.
 * Body: { token_mint: string, dev_wallet?: string, lookback_pages?: number }
 */
import { createClient } from "@supabase/supabase-js";
import { solscanFetch } from "../_shared/solscan-rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SOLSCAN_KEY = Deno.env.get("SOLSCAN_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token_mint, dev_wallet: dev_in, lookback_pages = 2 } = await req.json();
    if (!token_mint) return json({ error: "token_mint required" }, 400);
    if (!SOLSCAN_KEY) return json({ error: "SOLSCAN_API_KEY missing" }, 500);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let dev_wallet = dev_in as string | undefined;
    if (!dev_wallet) {
      const { data: lc } = await supa.from("token_lifecycle").select("creator_wallet, metadata").eq("token_mint", token_mint).maybeSingle();
      dev_wallet = (lc as any)?.creator_wallet;
    }
    if (!dev_wallet) return json({ ok: false, reason: "no_dev_wallet" }, 200);

    // Pull dev wallet's DeFi activities involving the token mint
    let buybacks_usd = 0;
    let buyback_count = 0;
    const evidence: string[] = [];
    for (let page = 1; page <= lookback_pages; page++) {
      const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${dev_wallet}&token=${token_mint}&activity_type[]=ACTIVITY_TOKEN_SWAP&page=${page}&page_size=40&sort_by=block_time&sort_order=desc`;
      const r = await solscanFetch(url, {
        headers: { token: SOLSCAN_KEY, accept: 'application/json' },
        timeoutMs: 10000,
        callerName: 'probe-buybacks',
      });
      if (!r.ok) break;
      const items = (r.body as any)?.data ?? [];
      if (!Array.isArray(items) || !items.length) break;
      for (const a of items) {
        // Identify a BUY: dev received the target token
        const routers = a?.routers ?? a?.amount_info ?? null;
        const value = Number(a?.value_usd ?? a?.amount_usd ?? 0);
        if (a?.activity_type === "ACTIVITY_TOKEN_SWAP" && value > 0) {
          // Heuristic: if "token2" === mint, it's a buy
          const t2 = a?.token2 ?? a?.amount_info?.token2;
          if (t2 === token_mint || a?.to_token === token_mint) {
            buybacks_usd += value;
            buyback_count += 1;
            if (a?.trans_id) evidence.push(a.trans_id);
          }
        }
      }
      if (items.length < 40) break;
    }

    const { data: lc2 } = await supa.from("token_lifecycle").select("metadata").eq("token_mint", token_mint).maybeSingle();
    const meta = { ...(lc2?.metadata ?? {}), buybacks_usd, buyback_count, buyback_evidence: evidence.slice(0, 20) };
    await supa.from("token_lifecycle").update({ metadata: meta }).eq("token_mint", token_mint);

    return json({ ok: true, token_mint, dev_wallet, buybacks_usd, buyback_count, evidence: evidence.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}