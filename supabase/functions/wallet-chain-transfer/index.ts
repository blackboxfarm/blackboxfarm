import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "https://esm.sh/@solana/web3.js@1.95.3";
import { decode } from "https://esm.sh/bs58@5.0.0";

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

    const { from_wallet_id, to_wallet_id, transfer_mode, transfer_value, rpc_url } = await req.json();

    if (!from_wallet_id || !to_wallet_id || !rpc_url) {
      throw new Error("Missing required parameters");
    }

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get source wallet with encrypted key
    const { data: fromWallet, error: fromError } = await supabaseService
      .from("blackbox_wallets")
      .select("*")
      .eq("id", from_wallet_id)
      .eq("is_active", true)
      .single();

    if (fromError || !fromWallet) {
      throw new Error("Source wallet not found");
    }

    // Get destination wallet
    const { data: toWallet, error: toError } = await supabaseService
      .from("blackbox_wallets")
      .select("*")
      .eq("id", to_wallet_id)
      .eq("is_active", true)
      .single();

    if (toError || !toWallet) {
      throw new Error("Destination wallet not found");
    }

    // Decrypt source wallet private key
    const { data: decryptedData, error: decryptError } = await supabaseClient.functions.invoke(
      'encrypt-data',
      { body: { data: fromWallet.secret_key_encrypted, action: 'decrypt' } }
    );

    if (decryptError) {
      console.error('Decryption error:', decryptError);
      throw new Error("Failed to decrypt wallet secret");
    }

    const secretKey = (decryptedData as { decryptedData: string }).decryptedData;
    const fromKeypair = Keypair.fromSecretKey(decode(secretKey));
    const toPublicKey = new PublicKey(toWallet.pubkey);

    // Connect to Solana
    const connection = new Connection(rpc_url, "confirmed");

    // Get current balance
    const balance = await connection.getBalance(fromKeypair.publicKey);
    const feeBuffer = 5000; // lamports

    // Calculate transfer amount
    let transferLamports = 0;
    const mode = transfer_mode || 'all';
    const value = transfer_value || 0;

    switch (mode) {
      case 'all':
        transferLamports = Math.max(0, balance - feeBuffer);
        break;
      case 'sol':
        const requestedLamports = Math.floor(value * 1_000_000_000);
        const maxAvailable = balance - feeBuffer;
        transferLamports = Math.min(requestedLamports, Math.max(0, maxAvailable));
        break;
      case 'percent':
        const percentAmount = Math.floor(balance * (value / 100));
        transferLamports = Math.max(0, percentAmount - feeBuffer);
        break;
      default:
        throw new Error("Invalid transfer mode");
    }

    if (transferLamports <= 0) {
      throw new Error("Insufficient balance for transfer");
    }

    // Create and send transaction
    const ix = SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: transferLamports
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromKeypair.publicKey }).add(ix);
    tx.sign(fromKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });

    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature
    }, "confirmed");

    console.log(`Transfer completed: ${signature}`);

    // Update balances (actual balances will be polled by frontend)
    const newFromBalance = await connection.getBalance(fromKeypair.publicKey);
    const newToBalance = await connection.getBalance(toPublicKey);

    await supabaseService
      .from("blackbox_wallets")
      .update({ sol_balance: newFromBalance / 1_000_000_000 })
      .eq("id", from_wallet_id);

    await supabaseService
      .from("blackbox_wallets")
      .update({ sol_balance: newToBalance / 1_000_000_000 })
      .eq("id", to_wallet_id);

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        transferred_lamports: transferLamports,
        transferred_sol: transferLamports / 1_000_000_000
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error transferring funds:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
