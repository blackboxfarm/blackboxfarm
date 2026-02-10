import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Wallet source configurations
const WALLET_SOURCES = [
  { table: 'wallet_pools', secretCol: 'secret_key_encrypted', encrypted: true },
  { table: 'blackbox_wallets', secretCol: 'secret_key_encrypted', encrypted: true },
  { table: 'super_admin_wallets', secretCol: 'secret_key_encrypted', encrypted: true },
  { table: 'airdrop_wallets', secretCol: 'secret_key_encrypted', encrypted: true },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[export-wallet-key] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is super admin
    const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (superAdminError) {
      console.error("[export-wallet-key] is_super_admin RPC error:", superAdminError);
    }
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { wallet_id, source } = await req.json();
    if (!wallet_id || !source) {
      return new Response(
        JSON.stringify({ error: "wallet_id and source are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[export-wallet-key] Super admin ${user.id} requesting key for ${source}/${wallet_id}`);

    // Find the correct source config
    const sourceConfig = WALLET_SOURCES.find(s => s.table === source);
    if (!sourceConfig) {
      return new Response(
        JSON.stringify({ error: `Unknown wallet source: ${source}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the wallet
    const { data: wallet, error: fetchError } = await supabase
      .from(sourceConfig.table)
      .select(`id, pubkey, ${sourceConfig.secretCol}`)
      .eq("id", wallet_id)
      .single();

    if (fetchError || !wallet) {
      console.error("[export-wallet-key] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawSecret = wallet[sourceConfig.secretCol];
    if (!rawSecret) {
      return new Response(
        JSON.stringify({ error: "No secret key stored for this wallet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let secretKey: string;
    
    if (sourceConfig.encrypted) {
      // Decrypt the secret using the same logic as encrypt-data
      try {
        secretKey = await decryptWalletSecretAuto(rawSecret);
      } catch (err: any) {
        console.error("[export-wallet-key] Decryption failed:", err.message);
        return new Response(
          JSON.stringify({ error: "Failed to decrypt secret key" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Not encrypted, use as-is
      secretKey = rawSecret;
    }

    console.log(`[export-wallet-key] Successfully retrieved key for wallet ${wallet_id}`);

    // Log the access for security audit
    await supabase.from("activity_logs").insert({
      message: `Private key exported for wallet: ${wallet.pubkey.slice(0, 8)}...`,
      log_level: "warn",
      metadata: {
        wallet_id: wallet.id,
        pubkey: wallet.pubkey,
        source: sourceConfig.table,
        accessed_by: user.id,
        action: "private_key_export"
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        pubkey: wallet.pubkey,
        secret_key: secretKey
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[export-wallet-key] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
