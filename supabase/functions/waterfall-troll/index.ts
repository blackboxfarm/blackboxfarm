import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "npm:@solana/web3.js@1.95.3";
import { getAssociatedTokenAddress, getAccount } from "npm:@solana/spl-token@0.4.8";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TROLL_MINT = "5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const CYCLES = 10;
const GAP_MS = 5000;
const BUY_LAMPORTS = 300_000; // ~$0.02 at $68/SOL
const SLIPPAGE_BPS = 500; // 5% — small notional needs headroom

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jupQuote(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`https://quote-api.jup.ag/v6/quote?${qs}`);
  if (!r.ok) throw new Error(`quote ${r.status}: ${await r.text()}`);
  return r.json();
}

async function jupSwap(quoteResponse: unknown, userPublicKey: string) {
  const r = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  if (!r.ok) throw new Error(`swap ${r.status}: ${await r.text()}`);
  return r.json() as Promise<{ swapTransaction: string }>;
}

async function execSwap(connection: Connection, kp: Keypair, inputMint: string, outputMint: string, amount: string) {
  const quote = await jupQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps: String(SLIPPAGE_BPS),
    onlyDirectRoutes: "false",
  });
  const { swapTransaction } = await jupSwap(quote, kp.publicKey.toBase58());
  const txBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  const vtx = VersionedTransaction.deserialize(txBuf);
  vtx.sign([kp]);
  const sig = await connection.sendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
  const bh = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  return sig;
}

async function getTokenBalanceRaw(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const acc = await getAccount(connection, ata);
    return acc.amount;
  } catch {
    return 0n;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
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

    const { walletId } = await req.json();
    if (!walletId) throw new Error("walletId required");

    const { data: w, error: werr } = await admin.from("waterfall_wallets").select("pubkey,secret_key_encrypted").eq("id", walletId).single();
    if (werr || !w) throw new Error("wallet not found");

    const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);
    const secretBytes = secret.trim().startsWith("[") ? new Uint8Array(JSON.parse(secret)) : bs58.decode(secret.trim());
    const kp = Keypair.fromSecretKey(secretBytes);
    if (kp.publicKey.toBase58() !== w.pubkey) throw new Error("key mismatch");

    const connection = new Connection(getHeliusRpcUrl(), "confirmed");
    const mintPk = new PublicKey(TROLL_MINT);

    // Pre-flight: need at least BUY_LAMPORTS * CYCLES + buffer for fees
    const startBalance = await connection.getBalance(kp.publicKey);
    const minNeeded = BUY_LAMPORTS * CYCLES + 5_000_000; // ~0.005 SOL fee buffer
    if (startBalance < minNeeded) {
      throw new Error(`insufficient SOL: have ${(startBalance / LAMPORTS_PER_SOL).toFixed(6)}, need ~${(minNeeded / LAMPORTS_PER_SOL).toFixed(6)}`);
    }

    const cycles: Array<{ i: number; buy?: string; sell?: string; error?: string; ms: number }> = [];

    for (let i = 1; i <= CYCLES; i++) {
      const cStart = Date.now();
      const entry: { i: number; buy?: string; sell?: string; error?: string; ms: number } = { i, ms: 0 };
      try {
        // BUY
        const buySig = await execSwap(connection, kp, SOL_MINT, TROLL_MINT, String(BUY_LAMPORTS));
        entry.buy = buySig;
        // small pause for ATA to settle
        await sleep(1500);
        // SELL ALL TROLL we just got
        const trollBal = await getTokenBalanceRaw(connection, kp.publicKey, mintPk);
        if (trollBal > 0n) {
          const sellSig = await execSwap(connection, kp, TROLL_MINT, SOL_MINT, trollBal.toString());
          entry.sell = sellSig;
        } else {
          entry.error = "no TROLL received from buy";
        }
      } catch (e) {
        entry.error = (e as Error).message;
      }
      entry.ms = Date.now() - cStart;
      cycles.push(entry);
      console.log(`[troll] cycle ${i}/${CYCLES} ${entry.error ? "ERR " + entry.error : "ok"} (${entry.ms}ms)`);
      if (i < CYCLES) await sleep(GAP_MS);
    }

    const endBalance = await connection.getBalance(kp.publicKey);
    const lamportsSpent = startBalance - endBalance;

    return new Response(JSON.stringify({
      success: true,
      walletId,
      pubkey: w.pubkey,
      cycles,
      totalMs: Date.now() - started,
      startSol: startBalance / LAMPORTS_PER_SOL,
      endSol: endBalance / LAMPORTS_PER_SOL,
      netSolSpent: lamportsSpent / LAMPORTS_PER_SOL,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-troll", e);
    return new Response(JSON.stringify({ error: (e as Error).message, totalMs: Date.now() - started }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});