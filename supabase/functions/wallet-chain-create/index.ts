import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Keypair } from "https://esm.sh/@solana/web3.js@1.95.3";
import bs58 from "https://esm.sh/bs58@5.0.0";

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

    if (!user) {
      throw new Error("User not authenticated");
    }

    const { chain_id, position } = await req.json();

    if (position < 0 || position > 3) {
      throw new Error("Invalid position. Must be 0-3 (0=parent, 1-3=children)");
    }

    // Generate new Solana keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const secretKey = bs58.encode(keypair.secretKey);

    // Encrypt the secret key
    const { data: encryptedData, error: encryptError } = await supabaseClient.functions.invoke(
      'encrypt-data', 
      { body: { data: secretKey } }
    );

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      throw new Error("Failed to encrypt wallet secret");
    }

    const encryptedSecret = (encryptedData as { encryptedData: string }).encryptedData;

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Create the wallet
    const { data: wallet, error: insertError } = await supabaseService
      .from("blackbox_wallets")
      .insert({
        pubkey: publicKey,
        secret_key_encrypted: encryptedSecret,
        sol_balance: 0,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Wallet insert error:', insertError);
      throw insertError;
    }

    // Get or create wallet chain
    let chainData;
    if (chain_id) {
      const { data: existingChain, error: chainError } = await supabaseService
        .from("wallet_chains")
        .select("*")
        .eq("id", chain_id)
        .eq("user_id", user.id)
        .single();

      if (chainError && chainError.code !== 'PGRST116') {
        throw chainError;
      }

      chainData = existingChain;
    }

    if (!chainData) {
      // Create new chain
      const { data: newChain, error: createChainError } = await supabaseService
        .from("wallet_chains")
        .insert({
          user_id: user.id,
          ...(position === 0 && { parent_wallet_id: wallet.id }),
          ...(position === 1 && { child_1_wallet_id: wallet.id }),
          ...(position === 2 && { child_2_wallet_id: wallet.id }),
          ...(position === 3 && { child_3_wallet_id: wallet.id })
        })
        .select()
        .single();

      if (createChainError) {
        throw createChainError;
      }

      chainData = newChain;
    } else {
      // Update existing chain
      const updateField = position === 0 ? 'parent_wallet_id' :
                         position === 1 ? 'child_1_wallet_id' :
                         position === 2 ? 'child_2_wallet_id' : 'child_3_wallet_id';

      const { error: updateError } = await supabaseService
        .from("wallet_chains")
        .update({ [updateField]: wallet.id })
        .eq("id", chainData.id);

      if (updateError) {
        throw updateError;
      }
    }

    console.log(`Created wallet ${publicKey} at position ${position} for chain ${chainData.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        chain_id: chainData.id,
        wallet: {
          id: wallet.id,
          pubkey: publicKey,
          sol_balance: 0,
          position
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error creating wallet:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
