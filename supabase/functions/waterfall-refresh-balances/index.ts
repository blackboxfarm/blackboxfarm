import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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
          const tokensRes = await rpc("getTokenAccountsByOwner", [w.pubkey, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed" }]);
          const tokens = (tokensRes?.value ?? []).map((acc: any) => {
            const info = acc.account.data.parsed.info;
            return {
              mint: info.mint,
              amount: Number(info.tokenAmount.uiAmount ?? 0),
              decimals: Number(info.tokenAmount.decimals ?? 0),
            };
          }).filter((t: any) => t.amount > 0);
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

    return new Response(JSON.stringify({ success: true, wallets: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-refresh-balances", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});