/**
 * lifecycle-scorecard-builder
 * Gathers all factor probes for one token mint and writes a row to
 * token_lifecycle_scorecard. Idempotent — re-running upserts.
 *
 * Body: { token_mint: string, force?: boolean }
 */
import { createClient } from "@supabase/supabase-js";
import { scoreLifecycle, type LifecycleInputs } from "../_shared/lifecycle-scoring.ts";
import { solscanFetch } from "../_shared/solscan-rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOLSCAN_KEY = Deno.env.get("SOLSCAN_API_KEY") ?? "";

async function solscanTokenMeta(mint: string) {
  if (!SOLSCAN_KEY) return null;
  const r = await solscanFetch(`https://pro-api.solscan.io/v2.0/token/meta?address=${mint}`, {
    headers: { token: SOLSCAN_KEY, accept: 'application/json' },
    timeoutMs: 8000,
    cacheTtlMs: 300_000,
    callerName: 'lifecycle-scorecard-builder',
  });
  if (!r.ok) return null;
  return (r.body as any)?.data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token_mint, force = false } = await req.json();
    if (!token_mint || typeof token_mint !== "string") {
      return new Response(JSON.stringify({ error: "token_mint required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Worth-gate
    const { data: gate } = await supa.rpc("passes_worth_gate", { p_token_mint: token_mint });
    const worthGate = gate?.[0] ?? { passes: false, reasons: ["rpc_failed"] };

    // 2. Pull lifecycle row
    const { data: lc } = await supa
      .from("token_lifecycle")
      .select("*")
      .eq("token_mint", token_mint)
      .maybeSingle();

    // 3. Pull dev wallet (creator_wallet)
    const dev_wallet = (lc as any)?.creator_wallet ?? null;

    // 4. Solscan token meta — authority audit
    const meta = await solscanTokenMeta(token_mint);
    const evidence_refs: any[] = [];
    if (meta) evidence_refs.push({ endpoint: "/v2.0/token/meta", address: token_mint });

    // 5. Pull behavioral signals from existing tables
    const { data: behavior } = dev_wallet
      ? await supa.from("dev_behavior_scores").select("*").eq("dev_wallet", dev_wallet).maybeSingle()
      : { data: null } as any;

    const { data: fingerprint } = await supa
      .from("token_fingerprints")
      .select("*")
      .eq("token_mint", token_mint)
      .maybeSingle();

    // 6. Social signals
    const { data: socials } = await supa
      .from("token_social_links")
      .select("platform, link_type, is_current")
      .eq("token_mint", token_mint);

    const has_website = (socials ?? []).some((s: any) => s.platform === "website" && s.is_current);
    const has_telegram = (socials ?? []).some((s: any) => s.platform === "telegram" && s.is_current);
    const has_twitter = (socials ?? []).some((s: any) => s.platform === "twitter" && s.is_current);

    // 7. Boost spend
    const { data: boosts } = await supa
      .from("token_boost_history")
      .select("amount_usd")
      .eq("token_mint", token_mint);
    const boosts_usd = (boosts ?? []).reduce((s: number, b: any) => s + (Number(b.amount_usd) || 0), 0);

    // 8. Mesh
    const { data: mesh } = dev_wallet
      ? await supa
          .from("reputation_mesh")
          .select("source_id, source_type, relationship")
          .eq("linked_id", dev_wallet)
          .eq("linked_type", "wallet")
      : { data: [] } as any;

    const inputs: LifecycleInputs = {
      token_mint,
      dev_wallet,
      // mint/bonding from fingerprint
      bundle_pct_first_5_blocks: (fingerprint as any)?.bundle_pct ?? undefined,
      dev_buy_then_sell_during_bonding: (behavior as any)?.dev_dump_during_bonding ?? undefined,
      bonded_in_minutes: (lc as any)?.metadata?.bonded_in_minutes ?? null,
      dev_bonding_volume_pct: (fingerprint as any)?.dev_volume_pct ?? undefined,
      // graduation
      graduated: (lc as any)?.current_status === "graduated" || !!(lc as any)?.metadata?.graduated_at,
      liquidity_locked: (lc as any)?.metadata?.liquidity_locked ?? undefined,
      mint_authority_revoked: meta ? meta.mint_authority === null : undefined,
      freeze_authority_revoked: meta ? meta.freeze_authority === null : undefined,
      burn_events_count: (lc as any)?.metadata?.burn_events_count ?? 0,
      // sustain
      ath_mcap_usd: Number((lc as any)?.ath_24h_usd ?? (lc as any)?.market_cap ?? 0),
      hours_in_top_200: Number((lc as any)?.total_hours_in_top_200 ?? 0),
      buybacks_usd: (lc as any)?.metadata?.buybacks_usd ?? 0,
      boosts_usd,
      pumpfun_live_count: (lc as any)?.metadata?.pumpfun_live_count ?? 0,
      // social
      has_website,
      telegram_members: (lc as any)?.metadata?.telegram_members ?? (has_telegram ? 0 : undefined),
      x_community_members: (lc as any)?.metadata?.x_community_members ?? (has_twitter ? 0 : undefined),
      cto_handover: (lc as any)?.metadata?.cto_detected ?? undefined,
      socials_alive_post_death: (lc as any)?.metadata?.socials_alive_post_death ?? undefined,
      // mesh
      associative_wallets_count: (mesh ?? []).length,
      bundle_responsibility_score: (behavior as any)?.bundle_responsibility ?? undefined,
      kyc_root_reached: (behavior as any)?.kyc_root_reached ?? undefined,
      cex_label: (behavior as any)?.cex_label ?? null,
      scammy_pattern_detected: (behavior as any)?.is_scammy ?? undefined,
      rug_detected: (lc as any)?.death_cause === "rug" || undefined,
    };

    const result = scoreLifecycle(inputs, {
      passed: !!worthGate.passes,
      reasons: Array.isArray(worthGate.reasons) ? worthGate.reasons : [],
    });

    // 9. Upsert scorecard
    const { error: upErr } = await supa.from("token_lifecycle_scorecard").upsert({
      token_mint,
      dev_wallet,
      worth_gate_passed: result.worth_gate_passed,
      worth_gate_reasons: result.worth_gate_reasons,
      mint_bonding_score: result.phase_scores.mint_bonding,
      graduation_score: result.phase_scores.graduation,
      sustain_score: result.sustain_score,
      social_score: result.social_score,
      wallet_mesh_score: result.phase_scores.wallet_mesh,
      composite_score: result.composite_score,
      effort_score: result.effort_score,
      skill_score: result.skill_score,
      integrity_score: result.integrity_score,
      phase_scores: result.phase_scores,
      factor_scores: result.factor_scores,
      verdict: result.verdict,
      verdict_confidence: result.verdict_confidence,
      solscan_evidence_refs: evidence_refs,
      scored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "token_mint" });

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 10. Trigger rollup if dev_wallet present
    if (dev_wallet) {
      supa.functions.invoke("dev-reputation-rollup", { body: { wallet_address: dev_wallet } }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true, token_mint, dev_wallet, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});