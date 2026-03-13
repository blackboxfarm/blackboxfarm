import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Keypair } from "npm:@solana/web3.js@1.95.3";
import { encode } from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");

    const { installation_id } = await req.json();
    if (!installation_id) throw new Error("installation_id is required");

    // Verify ownership
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: install, error: installErr } = await supabaseService
      .from("channel_installations")
      .select("id, user_id")
      .eq("id", installation_id)
      .single();

    if (installErr || !install) throw new Error("Installation not found");
    if (install.user_id !== user.id) throw new Error("Not authorized");

    // Check if wallet already exists
    const { data: existing } = await supabaseService
      .from("channel_payment_wallets")
      .select("id, pubkey")
      .eq("installation_id", installation_id)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, wallet: { id: existing.id, pubkey: existing.pubkey }, existing: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const secretKey = encode(keypair.secretKey);

    // Encrypt
    const { data: encryptedData, error: encryptError } = await supabaseClient.functions.invoke(
      "encrypt-data",
      { body: { data: secretKey } }
    );
    if (encryptError) throw new Error("Failed to encrypt wallet secret");

    const encryptedSecret = encryptedData.encryptedData;

    // Insert wallet
    const { data: wallet, error: insertError } = await supabaseService
      .from("channel_payment_wallets")
      .insert({
        installation_id,
        pubkey: publicKey,
        secret_key_encrypted: encryptedSecret,
        required_sol: 0.25,
        current_balance: 0,
        is_paid: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Generated channel payment wallet ${publicKey} for installation ${installation_id}`);

    return new Response(
      JSON.stringify({ success: true, wallet: { id: wallet.id, pubkey: publicKey } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating channel wallet:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
