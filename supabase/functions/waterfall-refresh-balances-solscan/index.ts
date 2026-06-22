import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOLSCAN_BASE = "https://pro-api.solscan.io/v2.0";

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
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
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

async function fetchTokens(addr: string) {
  const out: Array<{ mint: string; amount: number; decimals: number }> = [];
  try {
    let page = 1;
    while (page <= 3) {
      const url = `${SOLSCAN_BASE}/account/token-accounts?address=${addr}&type=token&page=${page}&page_size=40&hide_zero=true`;
      const j = await solscanGet(url);
      const items = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.tokenAccounts) ? j.data.tokenAccounts : [];
      if (!items.length) break;
      for (const it of items) {
        const mint = it.token_address ?? it.tokenAddress ?? it.mint;
        if (!mint) continue;
        const decimals = Number(it.token_decimals ?? it.decimals ?? 0);
        const raw = it.amount ?? it.balance ?? 0;
        const ui = typeof it.ui_amount === "number"
          ? Number(it.ui_amount)
          : Number(raw) / Math.pow(10, decimals);
        if (!(ui > 0)) continue;
        out.push({ mint, amount: ui, decimals });
      }
      if (items.length < 40) break;
      page++;
    }
  } catch (_) { /* swallow; partial ok */ }
  return out;
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

    const results: Record<string, { sol: number; tokens: Array<{ mint: string; amount: number; decimals: number }> }> = {};
    const updates: { id: string; sol: number }[] = [];

    // Solscan Pro is rate-limited; cap concurrency.
    const concurrency = 3;
    let idx = 0;
    async function worker() {
      while (idx < wallets.length) {
        const i = idx++;
        const w = wallets[i] as { id: string; pubkey: string; sol_balance: number | null };
        const [solscanSol, tokens] = await Promise.all([fetchSol(w.pubkey), fetchTokens(w.pubkey)]);
        const rpcSol = await fetchRpcSol(w.pubkey);
        const finalSol = typeof rpcSol === "number" ? rpcSol : typeof solscanSol === "number" ? solscanSol : Number(w.sol_balance ?? 0);
        results[w.pubkey] = { sol: finalSol, tokens };
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

    return new Response(
      JSON.stringify({ success: true, partial: requestedPubkeys.length > 0, source: "solscan", wallets: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});