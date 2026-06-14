import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: wallets, error } = await admin
      .from("waterfall_wallets")
      .select("column_index,row_index,nickname,pubkey,secret_key_encrypted")
      .gte("row_index", 0)
      .lte("row_index", 9)
      .order("column_index").order("row_index");
    if (error) throw error;

    const out: any[] = [];
    for (const w of wallets ?? []) {
      const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);
      out.push({
        column: w.column_index + 1,
        wallet: w.row_index + 1,
        nickname: w.nickname,
        pubkey: w.pubkey,
        secret_base58: secret,
      });
    }

    try {
      await assertDbWrite(admin.from("secret_access_audit").insert({
        user_id: user.id,
        action: "export",
        resource: "waterfall_wallets",
        details: { count: out.length },
      }), "secret_access_audit", "waterfall_private_key_export_audit");
    } catch (_) { /* table shape may differ; ignore */ }

    return new Response(JSON.stringify({ success: true, wallets: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-export-keys", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});