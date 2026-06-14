import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .order("column_index").order("row_index");
    if (error) throw error;

    const out: any[] = [];
    for (const w of wallets ?? []) {
      let secret = w.secret_key_encrypted as string;
      if (secret.startsWith("AES:")) {
        const dec = await admin.functions.invoke("encrypt-data", { body: { action: "decrypt", data: secret } });
        const plain = (dec.data as any)?.decryptedData;
        if (plain) secret = plain;
      }
      out.push({
        column: w.column_index + 1,
        row: w.row_index === -1 ? "header" : w.row_index + 1,
        nickname: w.nickname,
        pubkey: w.pubkey,
        secret_base58: secret,
      });
    }

    try {
      await admin.from("secret_access_audit").insert({
        user_id: user.id,
        action: "export",
        resource: "waterfall_wallets",
        details: { count: out.length },
      });
    } catch (_) { /* table shape may differ; ignore */ }

    return new Response(JSON.stringify({ success: true, wallets: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-export-keys", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});