import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

async function rpc(method: string, params: any[]) {
  const res = await fetch(getHeliusRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) return new Response(JSON.stringify({ error: "Super admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: wallets } = await admin
      .from("waterfall_wallets")
      .select("id,pubkey")
      .gte("row_index", 0)
      .lte("row_index", 9);
    if (!wallets?.length) {
      return new Response(JSON.stringify({ success: true, wallets: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, { sol: number; tokens: Array<{ mint: string; amount: number; decimals: number }> }> = {};
    const updates: { id: string; sol: number }[] = [];

    // Limit concurrency
    const concurrency = 8;
    let idx = 0;
    async function worker() {
      while (idx < wallets.length) {
        const w = wallets[idx++];
        try {
          const bal = await rpc("getBalance", [w.pubkey]);
          const sol = (bal?.value ?? 0) / 1e9;
          const tokenAccounts = await Promise.all(
            TOKEN_PROGRAMS.map((programId) =>
              rpc("getTokenAccountsByOwner", [w.pubkey, { programId }, { encoding: "jsonParsed" }])
                .then((r) => r?.value ?? [])
                .catch((e) => {
                  console.warn("token account fetch failed for", w.pubkey, programId, e);
                  return [];
                }),
            ),
          );
          const byMint = new Map<string, { mint: string; amount: number; decimals: number }>();
          for (const acc of tokenAccounts.flat()) {
            const info = acc?.account?.data?.parsed?.info;
            const tokenAmount = info?.tokenAmount;
            if (!info?.mint || !tokenAmount) continue;
            const decimals = Number(tokenAmount.decimals ?? 0);
            const amount = Number(tokenAmount.uiAmountString ?? tokenAmount.uiAmount ?? 0);
            if (!(amount > 0)) continue;
            const prev = byMint.get(info.mint);
            byMint.set(info.mint, { mint: info.mint, amount: (prev?.amount ?? 0) + amount, decimals });
          }
          const tokens = [...byMint.values()];
          results[w.pubkey] = { sol, tokens };
          updates.push({ id: w.id, sol });
        } catch (e) {
          console.error("balance fetch failed for", w.pubkey, e);
          results[w.pubkey] = { sol: 0, tokens: [] };
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // Batch update sol balances
    for (const u of updates) {
      await assertDbWrite(
        admin.from("waterfall_wallets").update({ sol_balance: u.sol, last_balance_at: new Date().toISOString() }).eq("id", u.id),
        "waterfall_wallets",
        "waterfall_refresh_balance_update",
      );
    }

    // Persist token holdings into wallet_positions so the grid always shows
    // every token a wallet has ever held — not just what the last live RPC
    // call surfaced. Mints with zero balance are removed for that wallet.
    const nowIso = new Date().toISOString();
    for (const [pubkey, { tokens }] of Object.entries(results)) {
      const mints = tokens.map((t) => t.mint);
      if (tokens.length > 0) {
        const rows = tokens.map((t) => ({
          wallet_address: pubkey,
          token_mint: t.mint,
          balance: t.amount,
          total_invested_usd: 0,
          last_transaction_at: nowIso,
          updated_at: nowIso,
        }));
        await assertDbWrite(
          admin.from("wallet_positions").upsert(rows, { onConflict: "wallet_address,token_mint" }),
          "wallet_positions",
          "waterfall_refresh_positions_upsert",
        );
      }
      // Drop stale positions (mints no longer held by this wallet).
      let del = admin.from("wallet_positions").delete().eq("wallet_address", pubkey);
      if (mints.length > 0) del = del.not("token_mint", "in", `(${mints.map((m) => `"${m}"`).join(",")})`);
      await assertDbWrite(del, "wallet_positions", "waterfall_refresh_positions_prune");
    }

    return new Response(JSON.stringify({ success: true, wallets: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-refresh-balances", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});