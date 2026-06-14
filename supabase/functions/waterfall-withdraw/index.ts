import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.95.3";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "npm:@solana/spl-token@0.4.8";
import { decode as bs58decode } from "https://esm.sh/bs58@5.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) return new Response(JSON.stringify({ error: "Super admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { walletId, mint, amount, destination } = await req.json();
    if (!walletId || !mint || !destination || !(amount > 0)) {
      throw new Error("walletId, mint, amount (>0) and destination required");
    }
    if (destination.length < 32 || destination.length > 44) throw new Error("invalid destination");
    const destPk = new PublicKey(destination);

    const { data: w, error: werr } = await admin.from("waterfall_wallets").select("pubkey,secret_key_encrypted").eq("id", walletId).single();
    if (werr || !w) throw new Error("wallet not found");

    let secret = w.secret_key_encrypted as string;
    if (secret.startsWith("AES:")) {
      const dec = await admin.functions.invoke("encrypt-data", { body: { action: "decrypt", data: secret } });
      const plain = (dec.data as any)?.decryptedData;
      if (!plain) throw new Error("decryption failed");
      secret = plain;
    }

    let secretBytes: Uint8Array;
    if (secret.trim().startsWith("[")) secretBytes = new Uint8Array(JSON.parse(secret));
    else secretBytes = bs58decode(secret.trim());
    const kp = Keypair.fromSecretKey(secretBytes);
    if (kp.publicKey.toBase58() !== w.pubkey) throw new Error("key mismatch");

    const connection = new Connection(getHeliusRpcUrl(), "confirmed");
    const tx = new Transaction();

    if (mint === "SOL") {
      const balance = await connection.getBalance(kp.publicKey);
      let lamports = Math.floor(Number(amount) * LAMPORTS_PER_SOL);
      const fee = 5000;
      // "max" sentinel: caller can pass amount = -1 to sweep
      if (Number(amount) < 0) lamports = Math.max(0, balance - fee);
      if (lamports <= 0 || lamports + fee > balance) throw new Error(`insufficient SOL (have ${balance / LAMPORTS_PER_SOL})`);
      tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: destPk, lamports }));
    } else {
      const mintPk = new PublicKey(mint);
      const mintInfo = await getMint(connection, mintPk);
      const fromAta = await getAssociatedTokenAddress(mintPk, kp.publicKey);
      const toAta = await getAssociatedTokenAddress(mintPk, destPk);
      let toAccountExists = true;
      try { await getAccount(connection, toAta); } catch { toAccountExists = false; }
      if (!toAccountExists) {
        tx.add(createAssociatedTokenAccountInstruction(kp.publicKey, toAta, destPk, mintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
      }
      const rawAmount = BigInt(Math.floor(Number(amount) * 10 ** mintInfo.decimals));
      tx.add(createTransferCheckedInstruction(fromAta, mintPk, toAta, kp.publicKey, rawAmount, mintInfo.decimals));
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = kp.publicKey;
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");

    return new Response(JSON.stringify({ success: true, signature: sig, explorerUrl: `https://solscan.io/tx/${sig}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-withdraw", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});