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

function rawToUi(raw: unknown, decimals: unknown) {
  const n = Number(raw ?? 0);
  const d = Number(decimals ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(d)) return 0;
  return n / Math.pow(10, d);
}

function parseAssetTokens(result: any) {
  const byMint = new Map<string, { mint: string; amount: number; decimals: number }>();
  for (const asset of result?.items ?? []) {
    const info = asset?.token_info;
    const mint = asset?.id;
    if (!mint || !info) continue;
    const decimals = Number(info.decimals ?? 0);
    const amount = typeof info.balance === "number"
      ? rawToUi(info.balance, decimals)
      : Number(info.ui_amount ?? info.amount ?? 0) || rawToUi(info.balance, decimals);
    if (!(amount > 0)) continue;
    const prev = byMint.get(mint);
    byMint.set(mint, { mint, amount: (prev?.amount ?? 0) + amount, decimals });
  }
  return [...byMint.values()];
}

function parseNativeSol(result: any) {
  const native = result?.nativeBalance;
  const lamports = typeof native === "number" ? native : native?.lamports;
  return typeof lamports === "number" && Number.isFinite(lamports) ? lamports / 1e9 : null;
}

async function rpc(method: string, params: any) {
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
    const bodyText = await req.text().catch(() => "");
    const body = bodyText ? JSON.parse(bodyText) : {};
    const requestedPubkeys = Array.isArray(body?.pubkeys)
      ? body.pubkeys.filter((p: unknown) => typeof p === "string" && p.length >= 32 && p.length <= 44).slice(0, 100)
      : typeof body?.pubkey === "string" && body.pubkey.length >= 32 && body.pubkey.length <= 44
        ? [body.pubkey]
        : [];
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

    let walletQuery = admin
      .from("waterfall_wallets")
      .select("id,pubkey,sol_balance")
      .gte("row_index", 0)
      .lte("row_index", 9);
    if (requestedPubkeys.length > 0) walletQuery = walletQuery.in("pubkey", requestedPubkeys);
    const { data: wallets, error: walletsError } = await walletQuery;
    if (walletsError) throw walletsError;
    if (!wallets?.length) {
      return new Response(JSON.stringify({ success: true, wallets: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, { sol: number; tokens: Array<{ mint: string; amount: number; decimals: number }>; tokenScanOk?: boolean }> = {};
    const updates: { id: string; sol: number }[] = [];

    // Limit concurrency so live on-chain reads don't rate-limit and come back empty.
    const concurrency = requestedPubkeys.length > 0 ? 4 : 2;
    let idx = 0;
    async function worker() {
      while (idx < wallets.length) {
        const w = wallets[idx++];
        try {
          const assetResult = await rpc("getAssetsByOwner", {
            ownerAddress: w.pubkey,
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: true },
          }).catch((e) => {
            console.warn("asset fetch failed for", w.pubkey, e);
            return null;
          });
          let tokenScanOk = assetResult != null;
          let sol = parseNativeSol(assetResult);
          if (sol == null) {
            if (requestedPubkeys.length > 0) {
              const bal = await rpc("getBalance", [w.pubkey]);
              sol = (bal?.value ?? 0) / 1e9;
            } else {
              sol = Number(w.sol_balance ?? 0);
            }
          }
          let tokens = parseAssetTokens(assetResult);
          const byMint = new Map<string, { mint: string; amount: number; decimals: number }>();
          if (tokens.length === 0 && requestedPubkeys.length > 0) {
            const tokenAccounts = await Promise.all(
              TOKEN_PROGRAMS.map((programId) =>
                rpc("getTokenAccountsByOwner", [w.pubkey, { programId }, { encoding: "jsonParsed" }])
                  .then((r) => ({ ok: true, value: r?.value ?? [] }))
                  .catch((e) => {
                    console.warn("token account fetch failed for", w.pubkey, programId, e);
                    return { ok: false, value: [] };
                  }),
              ),
            );
            tokenScanOk = tokenAccounts.some((r) => r.ok);
            for (const acc of tokenAccounts.flatMap((r) => r.value)) {
              const info = acc?.account?.data?.parsed?.info;
              const tokenAmount = info?.tokenAmount;
              if (!info?.mint || !tokenAmount) continue;
              const decimals = Number(tokenAmount.decimals ?? 0);
              const amount = Number(tokenAmount.uiAmountString ?? tokenAmount.uiAmount ?? 0);
              if (!(amount > 0)) continue;
              const prev = byMint.get(info.mint);
              byMint.set(info.mint, { mint: info.mint, amount: (prev?.amount ?? 0) + amount, decimals });
            }
            tokens = [...byMint.values()];
          }
          results[w.pubkey] = { sol, tokens, tokenScanOk };
          updates.push({ id: w.id, sol });
        } catch (e) {
          console.error("balance fetch failed for", w.pubkey, e);
          results[w.pubkey] = { sol: Number(w.sol_balance ?? 0), tokens: [], tokenScanOk: false };
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
    for (const [pubkey, { tokens, tokenScanOk }] of Object.entries(results)) {
      if (tokenScanOk === false) continue;
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