import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.98.0";
import { decode as bs58Decode } from "https://esm.sh/bs58@6.0.0";
import { SecureStorage } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${Deno.env.get("HELIUS_API_KEY")}`;

async function getLatestInboundFunder(connection: Connection, recipient: PublicKey): Promise<PublicKey | null> {
  try {
    const signatures = await connection.getSignaturesForAddress(recipient, { limit: 50 });
    
    for (const sigInfo of signatures) {
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx?.meta?.preBalances || !tx?.meta?.postBalances) continue;
      
      const accountKeys = tx.transaction.message.accountKeys;
      const recipientIndex = accountKeys.findIndex(
        (key: any) => key.pubkey?.toBase58() === recipient.toBase58() || key.toBase58?.() === recipient.toBase58()
      );
      
      if (recipientIndex === -1) continue;
      
      const balanceChange = tx.meta.postBalances[recipientIndex] - tx.meta.preBalances[recipientIndex];
      
      if (balanceChange > 0) {
        // Find who sent the SOL (balance decreased)
        for (let i = 0; i < accountKeys.length; i++) {
          if (i === recipientIndex) continue;
          const change = tx.meta.postBalances[i] - tx.meta.preBalances[i];
          if (change < 0) {
            const key = accountKeys[i];
            const pubkeyStr = key.pubkey?.toBase58() || key.toBase58?.();
            if (pubkeyStr) {
              console.log(`[flipit-withdrawal] Found funder: ${pubkeyStr}`);
              return new PublicKey(pubkeyStr);
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("[flipit-withdrawal] Error finding funder:", error);
    return null;
  }
}

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

    const { walletId, destinationAddress, amount } = await req.json();

    if (!walletId) {
      return new Response(
        JSON.stringify({ error: "Wallet ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate custom amount if provided
    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || amount <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid amount. Must be a positive number." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[flipit-withdrawal] Processing withdrawal for wallet: ${walletId}`);

    // Get wallet from database
    const { data: wallet, error: walletError } = await supabase
      .from("super_admin_wallets")
      .select("*")
      .eq("id", walletId)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt the secret key
    const secretKeyBase58 = await SecureStorage.decryptWalletSecret(wallet.secret_key_encrypted);
    const secretKeyBytes = bs58Decode(secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKeyBytes);

    console.log(`[flipit-withdrawal] Wallet pubkey: ${wallet.pubkey}`);

    // Connect to Solana
    const connection = new Connection(HELIUS_RPC, "confirmed");
    
    // Get wallet balance
    const balance = await connection.getBalance(keypair.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    console.log(`[flipit-withdrawal] Current balance: ${solBalance} SOL`);

    if (balance < 5000) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance for withdrawal", balance: solBalance }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine destination
    let destination: PublicKey;
    
    if (destinationAddress) {
      destination = new PublicKey(destinationAddress);
      console.log(`[flipit-withdrawal] Using provided destination: ${destinationAddress}`);
    } else {
      // Find original funder
      const funder = await getLatestInboundFunder(connection, keypair.publicKey);
      if (!funder) {
        return new Response(
          JSON.stringify({ error: "Could not find original funder. Please provide a destination address." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      destination = funder;
      console.log(`[flipit-withdrawal] Found original funder: ${destination.toBase58()}`);
    }

    // Calculate amount to send
    const feeBuffer = 10000; // 0.00001 SOL for fees
    let amountToSend: number;

    if (amount !== undefined && amount !== null) {
      // Custom amount specified (convert SOL to lamports)
      amountToSend = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Verify we have enough balance for the custom amount + fees
      if (amountToSend + feeBuffer > balance) {
        return new Response(
          JSON.stringify({ 
            error: `Insufficient balance. Requested ${amount} SOL but only ${((balance - feeBuffer) / LAMPORTS_PER_SOL).toFixed(4)} SOL available.`,
            balance: solBalance 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[flipit-withdrawal] Using custom amount: ${amount} SOL (${amountToSend} lamports)`);
    } else {
      // Withdraw all (minus fee buffer)
      amountToSend = balance - feeBuffer;
      console.log(`[flipit-withdrawal] Withdrawing all: ${amountToSend / LAMPORTS_PER_SOL} SOL`);
    }

    if (amountToSend <= 0) {
      return new Response(
        JSON.stringify({ error: "Balance too low to withdraw" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create and send transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destination,
        lamports: amountToSend
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    console.log(`[flipit-withdrawal] Transaction sent: ${signature}`);

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`[flipit-withdrawal] Transaction confirmed`);

    const withdrawnAmount = amountToSend / LAMPORTS_PER_SOL;

    // Log the withdrawal
    await supabase.from("activity_logs").insert({
      message: `FlipIt wallet withdrawal: ${withdrawnAmount.toFixed(4)} SOL to ${destination.toBase58().slice(0, 8)}...`,
      log_level: "info",
      metadata: {
        wallet_id: walletId,
        amount_sol: withdrawnAmount,
        destination: destination.toBase58(),
        signature,
        user_id: user.id
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        amountSol: withdrawnAmount,
        destination: destination.toBase58(),
        explorerUrl: `https://solscan.io/tx/${signature}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[flipit-withdrawal] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
