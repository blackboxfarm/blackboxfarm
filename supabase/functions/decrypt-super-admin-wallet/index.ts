import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SecureStorage } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is super admin
    const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (superAdminError) {
      console.error("[decrypt-super-admin-wallet] is_super_admin RPC error:", superAdminError);
    }
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get wallet ID from request body
    const { wallet_id } = await req.json();
    if (!wallet_id) {
      return new Response(
        JSON.stringify({ error: "wallet_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[decrypt-super-admin-wallet] Super admin ${user.id} requesting decryption for wallet ${wallet_id}`);

    // Fetch the wallet
    const { data: wallet, error: fetchError } = await supabase
      .from("super_admin_wallets")
      .select("id, pubkey, secret_key_encrypted")
      .eq("id", wallet_id)
      .single();

    if (fetchError || !wallet) {
      console.error("[decrypt-super-admin-wallet] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt the secret key using the same encryption system used to store it
    const decryptedSecretKey = await SecureStorage.decryptWalletSecret(wallet.secret_key_encrypted);

    console.log(`[decrypt-super-admin-wallet] Successfully decrypted wallet ${wallet_id}`);

    // Log the access for security audit
    await supabase.from("activity_logs").insert({
      message: `Private key accessed for wallet: ${wallet.pubkey.slice(0, 8)}...`,
      log_level: "warn",
      metadata: {
        wallet_id: wallet.id,
        pubkey: wallet.pubkey,
        accessed_by: user.id,
        action: "private_key_export"
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        pubkey: wallet.pubkey,
        secret_key: decryptedSecretKey
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[decrypt-super-admin-wallet] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
