import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "npm:@solana/web3.js@1.87.6";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { SecureStorage } from "../_shared/encryption.ts";
import { getHeliusRpcUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HELIUS_RPC = getHeliusRpcUrl();

// Lightweight JSON-RPC helper — avoids heavy Connection bootstrap
async function rpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

serve(withRunLog('flipit-wallet-withdrawal', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isSuperAdmin, error: isSuperAdminError } = await supabase.rpc(
      "is_super_admin", { _user_id: user.id }
    );
    if (isSuperAdminError) {
      console.error('[flipit-withdrawal] is_super_admin RPC failed:', isSuperAdminError);
      return new Response(JSON.stringify({ error: "Authorization check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { walletId, destinationAddress, amount } = await req.json();

    if (!walletId) {
      return new Response(JSON.stringify({ error: "Wallet ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!destinationAddress) {
      return new Response(JSON.stringify({ error: "Destination address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (amount !== undefined && amount !== null && (typeof amount !== 'number' || amount <= 0)) {
      return new Response(JSON.stringify({ error: "Invalid amount. Must be a positive number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[flipit-withdrawal] Processing withdrawal for wallet: ${walletId}`);

    const { data: wallet, error: walletError } = await supabase
      .from("super_admin_wallets")
      .select("id,pubkey,secret_key_encrypted")
      .eq("id", walletId)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const secretKeyBase58 = await SecureStorage.decryptWalletSecret(wallet.secret_key_encrypted);
    const secretKeyBytes = bs58.decode(secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKeyBytes);

    console.log(`[flipit-withdrawal] Wallet pubkey: ${wallet.pubkey}`);

    // Get balance + recent blockhash in parallel via raw RPC (no heavy Connection)
    const [balanceRes, blockhashRes] = await Promise.all([
      rpc('getBalance', [keypair.publicKey.toBase58()]),
      rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
    ]);
    const balance: number = balanceRes.value;
    const blockhash: string = blockhashRes.value.blockhash;
    const solBalance = balance / LAMPORTS_PER_SOL;

    console.log(`[flipit-withdrawal] Current balance: ${solBalance} SOL`);

    if (balance < 5000) {
      return new Response(JSON.stringify({ error: "Insufficient balance for withdrawal", balance: solBalance }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const destination = new PublicKey(destinationAddress);
    console.log(`[flipit-withdrawal] Destination: ${destinationAddress}`);

    const feeBuffer = 10000;
    let amountToSend: number;

    if (amount !== undefined && amount !== null) {
      amountToSend = Math.floor(amount * LAMPORTS_PER_SOL);
      if (amountToSend + feeBuffer > balance) {
        return new Response(JSON.stringify({
          error: `Insufficient balance. Requested ${amount} SOL but only ${((balance - feeBuffer) / LAMPORTS_PER_SOL).toFixed(4)} SOL available.`,
          balance: solBalance
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      amountToSend = balance - feeBuffer;
    }

    if (amountToSend <= 0) {
      return new Response(JSON.stringify({ error: "Balance too low to withdraw" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destination,
        lamports: amountToSend
      })
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.sign(keypair);

    const rawTx = transaction.serialize();
    const base64Tx = btoa(String.fromCharCode(...new Uint8Array(rawTx)));

    const signature: string = await rpc('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }
    ]);

    console.log(`[flipit-withdrawal] Transaction sent: ${signature}`);

    const withdrawnAmount = amountToSend / LAMPORTS_PER_SOL;

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

    return new Response(JSON.stringify({
      success: true,
      signature,
      amountSol: withdrawnAmount,
      destination: destination.toBase58(),
      explorerUrl: `https://solscan.io/tx/${signature}`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[flipit-withdrawal] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}));
