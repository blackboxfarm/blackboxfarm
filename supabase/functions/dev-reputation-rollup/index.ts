/**
 * dev-reputation-rollup
 * Recomputes dev_reputation_v2 from all token_lifecycle_scorecard rows for a wallet.
 * Body: { wallet_address: string }
 */
import { createClient } from "@supabase/supabase-js";
import { rollupDevReputation } from "../_shared/lifecycle-scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { wallet_address } = await req.json();
    if (!wallet_address || typeof wallet_address !== "string") {
      return new Response(JSON.stringify({ error: "wallet_address required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cards, error } = await supa
      .from("token_lifecycle_scorecard")
      .select("token_mint, composite_score, effort_score, skill_score, integrity_score, sustain_score, social_score, verdict, scored_at")
      .eq("dev_wallet", wallet_address)
      .order("scored_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cards || cards.length === 0) {
      return new Response(JSON.stringify({ ok: true, wallet_address, message: "no scorecards" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rolled = rollupDevReputation(cards as any);
    if (!rolled) {
      return new Response(JSON.stringify({ ok: true, wallet_address, message: "rollup empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get token_lifecycle peak mcap for the dev's tokens
    const tokenMints = cards.map((c: any) => c.token_mint);
    const { data: lcRows } = await supa
      .from("token_lifecycle")
      .select("ath_24h_usd, market_cap")
      .in("token_mint", tokenMints);
    const peak = (lcRows ?? []).reduce(
      (m: number, r: any) => Math.max(m, Number(r.ath_24h_usd ?? r.market_cap ?? 0)),
      0,
    );

    // Boosts total
    const { data: boosts } = await supa
      .from("token_boost_history")
      .select("amount_usd")
      .in("token_mint", tokenMints);
    const total_boosts_usd = (boosts ?? []).reduce(
      (s: number, b: any) => s + (Number(b.amount_usd) || 0), 0,
    );

    const { error: upErr } = await supa.from("dev_reputation_v2").upsert({
      wallet_address,
      tokens_scored: rolled.tokens_scored,
      tokens_of_worth: cards.length,
      distribution: rolled.distribution,
      career_arc: rolled.career_arc,
      weighted_effort: rolled.weighted_effort,
      weighted_skill: rolled.weighted_skill,
      weighted_integrity: rolled.weighted_integrity,
      weighted_sustain: rolled.weighted_sustain,
      weighted_social: rolled.weighted_social,
      composite: rolled.composite,
      archetype: rolled.archetype,
      best_token_mint: rolled.best_token_mint,
      worst_token_mint: rolled.worst_token_mint,
      peak_mcap_lifetime: peak,
      total_boosts_usd,
      last_rolled_up_at: new Date().toISOString(),
    }, { onConflict: "wallet_address" });

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, wallet_address, rolled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});