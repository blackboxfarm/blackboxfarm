import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "npm:@solana/web3.js@1.87.6";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { getHeliusRpcUrl } from '../_shared/helius-client.ts';

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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isSuperAdmin } = await supabaseAdmin.rpc("is_super_admin", { _user_id: user.id });
    
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { walletId, destinationAddress } = await req.json();

    if (!walletId || !destinationAddress) {
      throw new Error("Missing walletId or destinationAddress");
    }

    // Validate destination address
    if (destinationAddress.length < 32 || destinationAddress.length > 44) {
      throw new Error("Invalid destination address");
    }

    console.log(`[AirdropWithdraw] Withdrawing from wallet ${walletId} to ${destinationAddress}`);

    // Get wallet details
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("airdrop_wallets")
      .select("pubkey, secret_key_encrypted")
      .eq("id", walletId)
      .single();

    if (walletError || !wallet) {
      throw new Error("Wallet not found");
    }

    // Decrypt secret key if needed
    let secretMaterial = wallet.secret_key_encrypted;

    if (secretMaterial.startsWith("AES:")) {
      // Decrypt using the encrypt-data function
      const { data: decryptData, error: decryptError } = await supabaseAdmin.functions.invoke("encrypt-data", {
        body: { action: "decrypt", data: secretMaterial },
      });

      if (decryptError || !decryptData?.decryptedData) {
        throw new Error("Failed to decrypt wallet key");
      }
      secretMaterial = decryptData.decryptedData;
    }

    // Parse secret key (handle base58 or JSON array)
    let secretKeyBytes: Uint8Array;
    const trimmed = secretMaterial.trim();
    
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed);
      secretKeyBytes = new Uint8Array(arr);
    } else {
      secretKeyBytes = bs58.decode(trimmed);
    }

    const keypair = Keypair.fromSecretKey(secretKeyBytes);
    
    // Verify pubkey matches
    if (keypair.publicKey.toBase58() !== wallet.pubkey) {
      console.error(`[AirdropWithdraw] Pubkey mismatch: expected ${wallet.pubkey}, got ${keypair.publicKey.toBase58()}`);
      throw new Error("Wallet key mismatch");
    }

    // Connect to Solana
    const connection = new Connection(getHeliusRpcUrl(), "confirmed");

    // Get balance
    const balance = await connection.getBalance(keypair.publicKey);
    const feeBuffer = 5000; // ~0.000005 SOL for tx fee
    const sendAmount = balance - feeBuffer;

    if (sendAmount <= 0) {
      throw new Error(`Insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    }

    console.log(`[AirdropWithdraw] Balance: ${balance / LAMPORTS_PER_SOL} SOL, sending: ${sendAmount / LAMPORTS_PER_SOL} SOL`);

    // Create and send transaction
    const destination = new PublicKey(destinationAddress);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destination,
        lamports: sendAmount,
      })
    );

    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature, "confirmed");

    console.log(`[AirdropWithdraw] Success! Signature: ${signature}`);

    // Update wallet balance in DB
    await supabaseAdmin
      .from("airdrop_wallets")
      .update({ sol_balance: feeBuffer / LAMPORTS_PER_SOL })
      .eq("id", walletId);

    return new Response(JSON.stringify({
      success: true,
      signature,
      amountSol: sendAmount / LAMPORTS_PER_SOL,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AirdropWithdraw] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
