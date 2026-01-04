import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Decryption function matching encrypt-data logic
async function decryptData(encryptedData: string): Promise<string> {
  // Check if this is AES encrypted data
  if (encryptedData.startsWith("AES:")) {
    const keyMaterial = Deno.env.get("ENCRYPTION_KEY");
    if (!keyMaterial) {
      throw new Error("ENCRYPTION_KEY required for AES decryption");
    }
    
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32));
      
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      
      // Remove AES prefix and decode from base64
      const aesData = encryptedData.substring(4);
      const combined = new Uint8Array(
        atob(aesData).split('').map(char => char.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encrypted
      );
      
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("AES decryption failed:", error);
      throw error;
    }
  } else {
    // Fallback to base64 decoding for legacy data
    try {
      return atob(encryptedData);
    } catch (error) {
      console.error("Base64 decryption failed:", error);
      // If base64 fails, it might be plain text
      return encryptedData;
    }
  }
}

// Wallet source configurations
const WALLET_SOURCES = [
  { table: 'wallet_pools', secretCol: 'secret_key', encrypted: false },
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
        secretKey = await decryptData(rawSecret);
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
