// Launcher Mint Watcher — polls Helius for each launcher's linked wallets and detects pump.fun mint creations.
// Cron: every 3s. Inserts a launcher_mint_events row and triggers launcher-snipe-executor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertUpsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const SOL_MINT = "So11111111111111111111111111111111111111112";

function ok(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function heliusRpc(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

/** Look at a parsed Helius transaction and detect a pump.fun mint creation by this wallet.
 * Returns { mint, devBuySol } or null. */
function detectPumpMint(tx: any, devWallet: string): { mint: string; devBuySol: number } | null {
  if (!tx || tx.meta?.err) return null;
  // Inspect tokenBalances for a newly-minted token whose owner is devWallet.
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  // Find postTokenBalance owned by devWallet that didn't exist in preTokenBalances.
  for (const b of post) {
    if (b.owner !== devWallet) continue;
    if (b.mint === SOL_MINT) continue;
    const existed = pre.some((p: any) => p.mint === b.mint && p.owner === devWallet);
    if (existed) continue;
    // Confirm pump.fun program touched this tx
    const keys: string[] = (tx.transaction?.message?.accountKeys || []).map((k: any) => typeof k === "string" ? k : k.pubkey);
    if (!keys.includes(PUMP_PROGRAM_ID)) continue;
    // Estimate dev SOL spent in this tx
    const idx = keys.indexOf(devWallet);
    let devBuySol = 0;
    if (idx >= 0) {
      const preBal = Number(tx.meta?.preBalances?.[idx] ?? 0);
      const postBal = Number(tx.meta?.postBalances?.[idx] ?? 0);
      devBuySol = Math.max(0, (preBal - postBal) / 1e9);
    }
    return { mint: b.mint, devBuySol };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const heliusKey = Deno.env.get("HELIUS_API_KEY");
  if (!heliusKey) return ok({ error: "HELIUS_API_KEY missing" }, 500);
  const rpc = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

  // Global kill switch
  const { data: kill } = await sb.from("launcher_global_kill_switch").select("killed").maybeSingle();
  if (kill?.killed) return ok({ skipped: "global kill switch on" });

  // Active profiles + rules
  const { data: profiles, error: pErr } = await sb
    .from("launcher_profiles")
    .select("id, name, linked_wallets, primary_dev_wallet, excluded_wallets, launcher_trade_rules(enabled, min_seconds_after_mint)")
    .eq("is_active", true);
  if (pErr) return ok({ error: pErr.message }, 500);

  const detected: any[] = [];
  for (const profile of (profiles || [])) {
    const rule = (profile as any).launcher_trade_rules?.[0] || (profile as any).launcher_trade_rules;
    const excluded = new Set<string>(((profile as any).excluded_wallets || []) as string[]);
    const wallets: string[] = Array.from(new Set([
      ...(profile.linked_wallets || []),
      profile.primary_dev_wallet,
    ].filter(Boolean))).filter((w) => !excluded.has(w as string)).slice(0, 20); // cap

    for (const w of wallets) {
      try {
        const sigRes = await heliusRpc(rpc, {
          jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
          params: [w, { limit: 5 }],
        });
        const sigs: any[] = sigRes?.result || [];
        // Only look at the last 60s of activity
        const cutoff = Math.floor(Date.now() / 1000) - 60;
        for (const s of sigs) {
          if (!s.signature || s.err) continue;
          if (s.blockTime && s.blockTime < cutoff) continue;
          // Already processed?
          const { data: existing } = await sb
            .from("launcher_mint_events")
            .select("id")
            .eq("launcher_profile_id", (profile as any).id)
            .contains("metadata", { signature: s.signature })
            .maybeSingle();
          if (existing) continue;
          const txRes = await heliusRpc(rpc, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [s.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
          });
          const hit = detectPumpMint(txRes?.result, w);
          if (!hit) continue;
          // Insert detected event
          const row = await assertUpsert(
            sb.from("launcher_mint_events").upsert({
              launcher_profile_id: (profile as any).id,
              mint_address: hit.mint,
              dev_wallet_used: w,
              dev_initial_buy_sol: hit.devBuySol,
              status: "detected",
              metadata: { signature: s.signature, blockTime: s.blockTime },
            }, { onConflict: "launcher_profile_id,mint_address", ignoreDuplicates: false }).select("id").single(),
            "launcher_mint_events"
          );
          detected.push({ profile: profile.name, mint: hit.mint, devBuySol: hit.devBuySol });
          // Fire snipe executor (non-blocking)
          if (rule?.enabled) {
            sb.functions.invoke("launcher-snipe-executor", {
              body: { mintEventId: (row as any).id },
            }).catch((e) => console.warn("[mint-watcher] executor invoke failed", e?.message));
          }
          // Fire enricher in parallel
          sb.functions.invoke("launcher-token-enricher", {
            body: { mint: hit.mint, launcherProfileId: (profile as any).id },
          }).catch(() => {});
        }
      } catch (e) {
        console.warn(`[mint-watcher] ${profile.name}/${w?.slice(0, 6)}:`, (e as Error).message);
      }
    }
  }

  return ok({ detected, count: detected.length });
});