import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptWalletSecretAuto, describeWalletSecretEnvelope } from "../_shared/decrypt-wallet-secret.ts";
import { assertDbWrite } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(withRunLog('decrypt-blackbox-wallet', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { wallet_id, pubkey } = body || {};
    if (!wallet_id && !pubkey) {
      return new Response(JSON.stringify({ error: "wallet_id or pubkey is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase.from("blackbox_wallets").select("id, pubkey, secret_key_encrypted").limit(1);
    if (wallet_id) query = query.eq("id", wallet_id);
    else query = query.eq("pubkey", pubkey);
    const { data: wallet, error: fetchError } = await query.maybeSingle();

    if (fetchError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found in blackbox_wallets" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let secret_key: string;
    try {
      secret_key = await decryptWalletSecretAuto(wallet.secret_key_encrypted);
    } catch (err: any) {
      const diagnostics = describeWalletSecretEnvelope(wallet.secret_key_encrypted);
      console.error("[decrypt-blackbox-wallet] Decryption failed:", {
        wallet_id: wallet.id,
        pubkey: wallet.pubkey,
        diagnostics,
        hasEncryptionKey: !!Deno.env.get("ENCRYPTION_KEY"),
        error: err?.message || String(err),
      });
      return new Response(JSON.stringify({
        error: "Failed to decrypt secret key",
        code: "WALLET_DECRYPT_FAILED",
        diagnostics,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await assertDbWrite(supabase.from("activity_logs").insert({
      message: `BlackBox legacy wallet private key accessed: ${wallet.pubkey.slice(0, 8)}...`,
      log_level: "warn",
      metadata: {
        wallet_id: wallet.id,
        pubkey: wallet.pubkey,
        accessed_by: user.id,
        action: "blackbox_private_key_export",
        source_table: "blackbox_wallets",
      },
    }), "activity_logs", "blackbox_private_key_export_audit");

    return new Response(JSON.stringify({ success: true, pubkey: wallet.pubkey, secret_key }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[decrypt-blackbox-wallet] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));