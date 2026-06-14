import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@6.0.0";
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
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    let userId: string | null = null;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
      if (!isSuper) return new Response(JSON.stringify({ error: "Super admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      userId = user.id;
    } else if (body.bootstrap !== true) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existing } = await admin
      .from("waterfall_wallets")
      .select("column_index,row_index")
      .gte("row_index", 0)
      .lte("row_index", 9);
    const have = new Set((existing ?? []).map((r: any) => `${r.column_index}:${r.row_index}`));

    const toInsert: any[] = [];
    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 10; r++) {
        if (have.has(`${c}:${r}`)) continue;
        const kp = Keypair.generate();
        const secret = bs58.encode(kp.secretKey);
        const enc = await admin.functions.invoke("encrypt-data", { body: { data: secret, action: "encrypt" } });
        const encrypted = (enc.data as any)?.encryptedData ?? secret;
        toInsert.push({
          column_index: c,
          row_index: r,
          pubkey: kp.publicKey.toBase58(),
          secret_key_encrypted: encrypted,
          created_by: userId,
          nickname: `Waterfall ${c + 1} · Wallet ${r + 1}`,
        });
      }
    }

    if (toInsert.length) {
      await assertDbWrite(
        admin.from("waterfall_wallets").insert(toInsert),
        "waterfall_wallets",
        "waterfall_generate_100_wallets",
      );
    }

    return new Response(JSON.stringify({ success: true, generated: toInsert.length, target: 100 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-generate-all", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});