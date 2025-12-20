import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, Keypair } from "npm:@solana/web3.js@1.95.3";
import bs58 from "https://esm.sh/bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Import refund logic similar to solana.ts
async function getLatestInboundFunder(connection: Connection, recipient: any): Promise<any | null> {
  try {
    const sigs = await connection.getSignaturesForAddress(recipient, { limit: 40 });
    for (const sig of sigs) {
      const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      const meta = tx?.meta as any;
      const msgAny: any = tx?.transaction?.message as any;
      if (!meta || !msgAny) continue;
      let keys: any[] = [];
      try {
        if (typeof msgAny.getAccountKeys === "function") {
          keys = msgAny.getAccountKeys().staticAccountKeys as any[];
        } else if (Array.isArray((msgAny as any).accountKeys)) {
          keys = (msgAny as any).accountKeys as any[];
        }
      } catch {}
      if (!keys || !keys.length) continue;
      const idx = keys.findIndex((k: any) => k.equals(recipient));
      if (idx >= 0 && meta.postBalances && meta.preBalances) {
        const pre = Number(meta.preBalances[idx] ?? 0);
        const post = Number(meta.postBalances[idx] ?? 0);
        if (post > pre) {
          const fromIdx = (meta.preBalances as any[]).findIndex((_: any, i: number) => i !== idx && Number(meta.preBalances[i] ?? 0) > Number(meta.postBalances[i] ?? 0));
          if (fromIdx >= 0) return keys[fromIdx];
        }
      }
    }
  } catch {}
  return null;
}

async function refundToFunder(connection: Connection, owner: Keypair): Promise<string | null> {
  try {
    const balance = await connection.getBalance(owner.publicKey);
    const feeBufferLamports = 5000;
    const spendable = Math.max(0, balance - feeBufferLamports);
    if (spendable <= 0) return null;
    
    const dest = await getLatestInboundFunder(connection, owner.publicKey);
    if (!dest) return null;
    
    const { SystemProgram, Transaction } = await import("npm:@solana/web3.js@1.95.3");
    const ix = SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: dest, lamports: spendable });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey }).add(ix);
    tx.sign(owner);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
    return sig;
  } catch (error) {
    console.error("Refund error:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Authentication failed");
    }

    // Parse request body
    const { wallet_id } = await req.json();
    if (!wallet_id) {
      throw new Error("wallet_id is required");
    }

    // Get wallet details with campaign ownership check
    const { data: wallet, error: walletError } = await supabase
      .from('blackbox_wallets')
      .select(`
        id,
        pubkey,
        secret_key_encrypted,
        campaign_id,
        blackbox_campaigns!inner(user_id)
      `)
      .eq('id', wallet_id)
      .eq('blackbox_campaigns.user_id', user.id)
      .single();

    if (walletError || !wallet) {
      throw new Error("Wallet not found or access denied");
    }

    // Decrypt the wallet secret using service role
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: decryptResult, error: decryptError } = await supabaseServiceRole.functions.invoke('encrypt-data', {
      body: { data: wallet.secret_key_encrypted, action: 'decrypt' }
    });

    if (decryptError || !decryptResult?.decryptedData) {
      throw new Error("Failed to decrypt wallet secret");
    }

    // Parse the private key
    let secretKey: Uint8Array;
    try {
      const decryptedSecret = decryptResult.decryptedData;
      if (decryptedSecret.startsWith('[') && decryptedSecret.endsWith(']')) {
        secretKey = new Uint8Array(JSON.parse(decryptedSecret));
      } else {
        secretKey = bs58.decode(decryptedSecret);
      }
    } catch (error) {
      throw new Error("Invalid private key format");
    }

    // Create keypair and connection
    const keypair = Keypair.fromSecretKey(secretKey);
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Perform the refund
    const signature = await refundToFunder(connection, keypair);
    
    if (!signature) {
      throw new Error("Withdrawal failed - no funds to withdraw or no original funder found");
    }

    // Update wallet balance in database
    const newBalance = await connection.getBalance(keypair.publicKey);
    await supabaseServiceRole
      .from('blackbox_wallets')
      .update({ sol_balance: newBalance / 1000000000 })
      .eq('id', wallet_id);

    // Log the withdrawal
    console.log(`Withdrawal successful for wallet ${wallet.pubkey}: ${signature}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        signature,
        explorerUrl: `https://solscan.io/tx/${signature}`,
        message: "All SOL successfully returned to original depositor"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Withdrawal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});