/**
 * dev-verdict-resolver
 * Public entry point: input EITHER token_mint OR wallet_address.
 * Returns: dev_reputation_v2 + every scorecard + linked tokens.
 *
 * If a token_mint is given without a corresponding scorecard, this
 * function triggers lifecycle-scorecard-builder synchronously, then
 * returns the fresh result.
 */
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token_mint = url.searchParams.get("token_mint");
    let wallet_address = url.searchParams.get("wallet_address");
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token_mint = token_mint ?? body.token_mint ?? null;
      wallet_address = wallet_address ?? body.wallet_address ?? null;
    }
    if (!token_mint && !wallet_address) {
      return new Response(JSON.stringify({ error: "token_mint or wallet_address required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve dev wallet from token if needed
    if (token_mint && !wallet_address) {
      const { data: card } = await supa
        .from("token_lifecycle_scorecard")
        .select("dev_wallet")
        .eq("token_mint", token_mint)
        .maybeSingle();
      if (card?.dev_wallet) wallet_address = card.dev_wallet;
      else {
        // Build it now
        await supa.functions.invoke("lifecycle-scorecard-builder", { body: { token_mint } });
        const { data: c2 } = await supa
          .from("token_lifecycle_scorecard")
          .select("dev_wallet")
          .eq("token_mint", token_mint)
          .maybeSingle();
        wallet_address = c2?.dev_wallet ?? null;
      }
    }

    if (!wallet_address) {
      // Token-only verdict (no dev resolved)
      const { data: card } = await supa
        .from("token_lifecycle_scorecard")
        .select("*")
        .eq("token_mint", token_mint)
        .maybeSingle();
      return new Response(JSON.stringify({ token_mint, dev_reputation: null, scorecards: card ? [card] : [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch reputation + all scorecards
    const [{ data: rep }, { data: cards }] = await Promise.all([
      supa.from("dev_reputation_v2").select("*").eq("wallet_address", wallet_address).maybeSingle(),
      supa.from("token_lifecycle_scorecard").select("*").eq("dev_wallet", wallet_address).order("scored_at", { ascending: false }),
    ]);

    // Hydrate token names/symbols
    const mints = (cards ?? []).map((c: any) => c.token_mint);
    const { data: lc } = mints.length
      ? await supa.from("token_lifecycle").select("token_mint, name, symbol, ath_24h_usd, market_cap, current_status, image_url").in("token_mint", mints)
      : { data: [] } as any;
    const lcMap = new Map<string, any>((lc ?? []).map((r: any) => [r.token_mint, r]));
    const enriched = (cards ?? []).map((c: any) => ({ ...c, token: lcMap.get(c.token_mint) ?? null }));

    return new Response(JSON.stringify({
      wallet_address,
      dev_reputation: rep ?? null,
      scorecards: enriched,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});