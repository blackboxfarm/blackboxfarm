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
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "npm:@solana/spl-token@0.4.8";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";

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
    const numericAmount = Number(amount);
    const isMax = numericAmount === -1;
    if (!walletId || !mint || !destination || (!isMax && !(numericAmount > 0))) {
      throw new Error("walletId, mint, amount and destination required");
    }
    if (destination.length < 32 || destination.length > 44) throw new Error("invalid destination");
    const destPk = new PublicKey(destination);

    const { data: w, error: werr } = await admin.from("waterfall_wallets").select("pubkey,secret_key_encrypted").eq("id", walletId).single();
    if (werr || !w) throw new Error("wallet not found");

    const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);

    let secretBytes: Uint8Array;
    if (secret.trim().startsWith("[")) secretBytes = new Uint8Array(JSON.parse(secret));
    else secretBytes = bs58.decode(secret.trim());
    const kp = Keypair.fromSecretKey(secretBytes);
    if (kp.publicKey.toBase58() !== w.pubkey) throw new Error("key mismatch");

    const connection = new Connection(getHeliusRpcUrl(), "confirmed");
    const tx = new Transaction();

    if (mint === "SOL") {
      const balance = await connection.getBalance(kp.publicKey);
      let lamports = Math.floor(numericAmount * LAMPORTS_PER_SOL);
      const fee = 5000;
      // "max" sentinel: caller can pass amount = -1 to sweep
      if (numericAmount < 0) lamports = Math.max(0, balance - fee);
      if (lamports <= 0 || lamports + fee > balance) throw new Error(`insufficient SOL (have ${balance / LAMPORTS_PER_SOL})`);
      tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: destPk, lamports }));
    } else {
      const mintPk = new PublicKey(mint);
      // Resolve the owning token program (classic SPL vs Token-2022) from the mint account.
      const mintAccountInfo = await connection.getAccountInfo(mintPk);
      if (!mintAccountInfo) throw new Error("mint account not found");
      const programId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const mintInfo = await getMint(connection, mintPk, "confirmed", programId);
      const fromAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
      const toAta = await getAssociatedTokenAddress(mintPk, destPk, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
      let toAccountExists = true;
      try { await getAccount(connection, toAta, "confirmed", programId); } catch { toAccountExists = false; }
      if (!toAccountExists) {
        tx.add(createAssociatedTokenAccountInstruction(kp.publicKey, toAta, destPk, mintPk, programId, ASSOCIATED_TOKEN_PROGRAM_ID));
      }
      let rawAmount: bigint;
      if (isMax) {
        const fromAcc = await getAccount(connection, fromAta, "confirmed", programId);
        rawAmount = fromAcc.amount;
        if (rawAmount === 0n) throw new Error("no token balance to withdraw");
      } else {
        rawAmount = BigInt(Math.floor(numericAmount * 10 ** mintInfo.decimals));
      }
      tx.add(createTransferCheckedInstruction(fromAta, mintPk, toAta, kp.publicKey, rawAmount, mintInfo.decimals, [], programId));
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