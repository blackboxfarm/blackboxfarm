import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.98.4";
import { encode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EncryptionResponse {
  encryptedData: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client for auth verification
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Verify user authentication
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user) {
      throw new Error("User not authenticated");
    }

    const { campaign_id } = await req.json();

    if (!campaign_id) {
      throw new Error("Campaign ID is required");
    }

    // Generate new Solana keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const secretKey = encode(keypair.secretKey);

    // Encrypt the secret key using the encryption edge function
    const { data: encryptedData, error: encryptError } = await supabaseClient.functions.invoke(
      'encrypt-data', 
      { body: { data: secretKey } }
    );

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      throw new Error("Failed to encrypt wallet secret");
    }

    const encryptedSecret = (encryptedData as EncryptionResponse).encryptedData;

    // Store wallet in database using service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // First create the wallet
    const { data: wallet, error: insertError } = await supabaseService
      .from("blackbox_wallets")
      .insert({
        pubkey: publicKey,
        secret_key_encrypted: encryptedSecret,
        sol_balance: 0
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Then link it to the campaign
    const { error: linkError } = await supabaseService
      .from("campaign_wallets")
      .insert({
        campaign_id: campaign_id,
        wallet_id: wallet.id
      });

    if (linkError) {
      throw linkError;
    }

    console.log(`Generated wallet ${publicKey} for campaign ${campaign_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        wallet: {
          id: wallet.id,
          pubkey: publicKey,
          sol_balance: 0
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error generating wallet:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});