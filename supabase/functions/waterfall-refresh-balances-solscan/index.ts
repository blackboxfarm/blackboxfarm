import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOLSCAN_BASE = "https://pro-api.solscan.io/v2.0";
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

type LiveToken = { mint: string; amount: number; decimals: number; symbol?: string | null; name?: string | null };

function authHeaders() {
  const key = Deno.env.get("SOLSCAN_API_KEY");
  if (!key) throw new Error("SOLSCAN_API_KEY not configured");
  return { token: key, accept: "application/json" } as Record<string, string>;
}

async function solscanGet(url: string) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`solscan ${res.status}: ${txt.slice(0, 160)}`);
  }
  return res.json();
}

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function rawToUi(raw: unknown, decimals: unknown): number {
  const n = numeric(raw);
  const d = numeric(decimals) ?? 0;
  if (n == null || !Number.isFinite(d)) return 0;
  return n / Math.pow(10, d);
}

function upsertToken(map: Map<string, LiveToken>, token: LiveToken, replace = false) {
  if (!token.mint || !(token.amount > 0)) return;
  const prev = map.get(token.mint);
  map.set(token.mint, {
    mint: token.mint,
    amount: replace ? token.amount : (prev?.amount ?? 0) + token.amount,
    decimals: Number.isFinite(token.decimals) ? token.decimals : (prev?.decimals ?? 0),
    symbol: token.symbol ?? prev?.symbol ?? null,
    name: token.name ?? prev?.name ?? null,
  });
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

async function fetchSol(addr: string): Promise<number | null> {
  try {
    const j = await solscanGet(`${SOLSCAN_BASE}/account/detail?address=${addr}`);
    const data = j?.data ?? {};
    const lam = numeric(data?.lamports ?? data?.account?.lamports ?? data?.nativeBalance?.lamports ?? data?.balance_lamports);
    if (lam != null) return lam / 1e9;
    const sol = numeric(data?.sol_balance ?? data?.solBalance ?? data?.balance);
    if (sol != null) return sol > 1_000_000 ? sol / 1e9 : sol;
    return null;
  } catch (_) {
    return null;
  }
}

async function fetchRpcSol(addr: string): Promise<number | null> {
  try {
    const bal = await rpc("getBalance", [addr]);
    const lamports = numeric(bal?.value);
    return lamports == null ? null : lamports / 1e9;
  } catch (_) {
    return null;
  }
}

async function fetchTokens(addr: string): Promise<{ tokens: LiveToken[]; ok: boolean }> {
  const byMint = new Map<string, LiveToken>();
  let ok = false;
  try {
    let page = 1;
    while (page <= 10) {
      const url = `${SOLSCAN_BASE}/account/token-accounts?address=${addr}&type=token&page=${page}&page_size=100&hide_zero=true`;
      const j = await solscanGet(url);
      const items = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.tokenAccounts) ? j.data.tokenAccounts : [];
      ok = true;
      if (!items.length) break;
      for (const it of items) {
        const mint = it.token_address ?? it.tokenAddress ?? it.mint ?? it.token?.address ?? it.token?.token_address;
        if (!mint) continue;
        const decimals = Number(it.token_decimals ?? it.decimals ?? it.token?.decimals ?? 0);
        const tokenAmount = it.tokenAmount ?? it.token_amount;
        const ui = numeric(it.ui_amount ?? it.uiAmount ?? it.uiAmountString ?? tokenAmount?.uiAmountString ?? tokenAmount?.uiAmount)
          ?? rawToUi(it.amount ?? it.balance ?? tokenAmount?.amount, decimals);
        if (!(ui > 0)) continue;
        upsertToken(byMint, {
          mint,
          amount: ui,
          decimals,
          symbol: it.token_symbol ?? it.symbol ?? it.token?.symbol ?? null,
          name: it.token_name ?? it.name ?? it.token?.name ?? null,
        });
      }
      if (items.length < 100) break;
      page++;
    }
  } catch (_) { /* swallow; partial ok */ }
  return { tokens: [...byMint.values()], ok };
}

async function fetchRpcTokens(addr: string): Promise<{ tokens: LiveToken[]; ok: boolean }> {
  const byMint = new Map<string, LiveToken>();
  let ok = false;
  try {
    const scans = await Promise.all(
      TOKEN_PROGRAMS.map((programId) =>
        rpc("getTokenAccountsByOwner", [addr, { programId }, { encoding: "jsonParsed" }])
          .then((r) => ({ ok: true, value: r?.value ?? [] }))
          .catch(() => ({ ok: false, value: [] })),
      ),
    );
    ok = scans.some((s) => s.ok);
    for (const acc of scans.flatMap((s) => s.value)) {
      const info = acc?.account?.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      if (!info?.mint || !tokenAmount) continue;
      const decimals = Number(tokenAmount.decimals ?? 0);
      const amount = numeric(tokenAmount.uiAmountString ?? tokenAmount.uiAmount) ?? rawToUi(tokenAmount.amount, decimals);
      if (!(amount > 0)) continue;
      upsertToken(byMint, { mint: info.mint, amount, decimals });
    }
  } catch (_) { /* swallow; partial ok */ }
  return { tokens: [...byMint.values()], ok };
}

function mergeTokens(solscanTokens: LiveToken[], rpcTokens: LiveToken[]) {
  const byMint = new Map<string, LiveToken>();
  for (const t of solscanTokens) upsertToken(byMint, t);
  // RPC token accounts are the final live account state; replace Solscan amounts
  // for matching mints while preserving any Solscan symbol/name metadata.
  for (const t of rpcTokens) upsertToken(byMint, t, true);
  return [...byMint.values()].sort((a, b) => b.amount - a.amount);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const bodyText = await req.text().catch(() => "");
    const body = bodyText ? JSON.parse(bodyText) : {};
    const requestedPubkeys: string[] = Array.isArray(body?.pubkeys)
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
      return new Response(JSON.stringify({ success: true, partial: requestedPubkeys.length > 0, source: "solscan", wallets: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, { sol: number; tokens: LiveToken[]; tokenScanOk?: boolean }> = {};
    const updates: { id: string; sol: number }[] = [];

    // Solscan Pro is rate-limited; cap concurrency.
    const concurrency = 3;
    let idx = 0;
    async function worker() {
      while (idx < wallets.length) {
        const i = idx++;
        const w = wallets[i] as { id: string; pubkey: string; sol_balance: number | null };
        const [solscanSol, solscanTokens, rpcSol, rpcTokens] = await Promise.all([
          fetchSol(w.pubkey),
          fetchTokens(w.pubkey),
          fetchRpcSol(w.pubkey),
          fetchRpcTokens(w.pubkey),
        ]);
        const finalSol = typeof rpcSol === "number" ? rpcSol : typeof solscanSol === "number" ? solscanSol : Number(w.sol_balance ?? 0);
        const tokens = mergeTokens(solscanTokens, rpcTokens);
        results[w.pubkey] = { sol: finalSol, tokens, tokenScanOk: solscanTokens.length > 0 || rpcTokens.length > 0 };
        if ((typeof rpcSol === "number" || typeof solscanSol === "number") && finalSol !== Number(w.sol_balance ?? 0)) {
          updates.push({ id: w.id, sol: finalSol });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));

    // Persist SOL deltas so the DB stays roughly in sync (best-effort; UI uses live values regardless).
    if (updates.length) {
      for (const u of updates) {
        await assertDbWrite(
          admin.from("waterfall_wallets")
            .update({ sol_balance: u.sol, last_balance_at: new Date().toISOString() })
            .eq("id", u.id),
          "waterfall_wallets",
          "waterfall_refresh_solscan_balance_update",
        );
      }
    }

    const nowIso = new Date().toISOString();
    for (const [pubkey, { tokens }] of Object.entries(results)) {
      const mints = tokens.map((t) => t.mint);
      if (tokens.length > 0) {
        await assertDbWrite(
          admin.from("wallet_positions").upsert(tokens.map((t) => ({
            wallet_address: pubkey,
            token_mint: t.mint,
            balance: t.amount,
            total_invested_usd: 0,
            last_transaction_at: nowIso,
            updated_at: nowIso,
          })), { onConflict: "wallet_address,token_mint" }),
          "wallet_positions",
          "waterfall_refresh_solscan_positions_upsert",
        );
      }
      let del = admin.from("wallet_positions").delete().eq("wallet_address", pubkey);
      if (mints.length > 0) del = del.not("token_mint", "in", `(${mints.map((m) => `"${m}"`).join(",")})`);
      await assertDbWrite(del, "wallet_positions", "waterfall_refresh_solscan_positions_prune");
    }

    return new Response(
      JSON.stringify({ success: true, partial: requestedPubkeys.length > 0, source: "solscan", wallets: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});