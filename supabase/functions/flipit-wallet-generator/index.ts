import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.98.0";
import bs58 from "https://esm.sh/bs58@5.0.0";
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
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { check_user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[flipit-wallet-generator] Super admin ${user.id} requesting wallet generation`);

    // Generate new Solana keypair
    const keypair = Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();
    const secretKeyBase58 = bs58.encode(keypair.secretKey);

    console.log(`[flipit-wallet-generator] Generated keypair with pubkey: ${pubkey}`);

    // Encrypt the secret key
    const encryptedSecret = await SecureStorage.encryptWalletSecret(secretKeyBase58);
    console.log(`[flipit-wallet-generator] Secret key encrypted successfully`);

    // Count existing FlipIt wallets for naming
    const { count } = await supabase
      .from("super_admin_wallets")
      .select("*", { count: "exact", head: true })
      .eq("wallet_type", "flipit");

    const walletNumber = (count || 0) + 1;
    const label = `FlipIt Wallet #${walletNumber}`;

    // Insert into super_admin_wallets table
    const { data: wallet, error: insertError } = await supabase
      .from("super_admin_wallets")
      .insert({
        label,
        pubkey,
        secret_key_encrypted: encryptedSecret,
        wallet_type: "flipit",
        is_active: true,
        created_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      console.error("[flipit-wallet-generator] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save wallet", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[flipit-wallet-generator] Wallet saved successfully with id: ${wallet.id}`);

    // Log the wallet creation for audit trail
    await supabase.from("activity_logs").insert({
      message: `FlipIt wallet generated: ${pubkey.slice(0, 8)}...`,
      log_level: "info",
      metadata: {
        wallet_id: wallet.id,
        pubkey,
        created_by: user.id,
        wallet_type: "flipit"
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        wallet: {
          id: wallet.id,
          label: wallet.label,
          pubkey: wallet.pubkey,
          wallet_type: wallet.wallet_type,
          created_at: wallet.created_at
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[flipit-wallet-generator] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
