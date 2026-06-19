import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.95.3";
import { getAssociatedTokenAddress, getAccount } from "npm:@solana/spl-token@0.4.8";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_SLIPPAGE_BPS = 500;
const JUP_SWAP_BASE = "https://lite-api.jup.ag/swap/v1";

const MAX_JUP_ATTEMPTS = 4;
const JUP_BACKOFF_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJupWithRetry(label: string, url: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_JUP_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(url, {
        ...(init ?? {}),
        cache: "no-store",
        headers: {
          ...(init?.headers ?? {}),
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });
      if (r.ok) return r;
      // Retry on 429 and 5xx; fail fast on other 4xx (bad mint, no route, etc.)
      if (r.status === 429 || r.status >= 500) {
        const body = await r.text().catch(() => "");
        console.warn(`[waterfall-swap] ${label} attempt ${attempt}/${MAX_JUP_ATTEMPTS} HTTP ${r.status}: ${body.slice(0, 200)}`);
        lastErr = new Error(`${label} ${r.status}: ${body}`);
      } else {
        const body = await r.text().catch(() => "");
        throw new Error(`${label} ${r.status}: ${body}`);
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      // Only retry transient network/DNS errors
      const transient = /dns|network|connect|timeout|fetch failed|sending request|EAI_AGAIN|ECONNRESET/i.test(msg)
        || /\b(429|5\d\d)\b/.test(msg);
      console.warn(`[waterfall-swap] ${label} attempt ${attempt}/${MAX_JUP_ATTEMPTS} error: ${msg}`);
      lastErr = e;
      if (!transient) throw e;
    }
    if (attempt < MAX_JUP_ATTEMPTS) await sleep(JUP_BACKOFF_MS * attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed after ${MAX_JUP_ATTEMPTS} attempts`);
}

async function jupQuote(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  // Cache-bust + force fresh route: add a nonce so any intermediate CDN/edge cache misses
  const nonce = `_t=${Date.now()}`;
  const r = await fetchJupWithRetry("quote", `${JUP_SWAP_BASE}/quote?${qs}&${nonce}`);
  return r.json();
}
async function jupSwap(quoteResponse: unknown, userPublicKey: string) {
  const r = await fetchJupWithRetry("swap", `${JUP_SWAP_BASE}/swap`, {
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
  return r.json() as Promise<{ swapTransaction: string }>;
}
async function execSwap(
  connection: Connection,
  kp: Keypair,
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number,
) {
  // Fresh quote — Jupiter v6 returns the best-priced route across all DEXes at this instant
  const quote = await jupQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps: String(slippageBps),
    onlyDirectRoutes: "false",
    swapMode: "ExactIn",
    maxAccounts: "64",
  });
  try {
    const inAmt = (quote as { inAmount?: string }).inAmount;
    const outAmt = (quote as { outAmount?: string }).outAmount;
    const route = ((quote as { routePlan?: Array<{ swapInfo?: { label?: string } }> }).routePlan ?? [])
      .map((h) => h.swapInfo?.label ?? "?")
      .join(" -> ");
    console.log(`[waterfall-swap] fresh quote ${inputMint.slice(0,4)}..->${outputMint.slice(0,4)}.. in=${inAmt} out=${outAmt} route=${route}`);
  } catch { /* logging only */ }
  const { swapTransaction } = await jupSwap(quote, kp.publicKey.toBase58());
  const txBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  const vtx = VersionedTransaction.deserialize(txBuf);
  vtx.sign([kp]);
  const sig = await connection.sendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
  const bh = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    "confirmed",
  );
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

    const body = await req.json();
    const walletId: string = body.walletId;
    const mint: string = body.mint;
    const side: "buy" | "sell" = body.side;
    const buyLamports: number = Number(body.buyLamports ?? 10_000_000); // default 0.01 SOL
    const slippageBps: number = Number(body.slippageBps ?? DEFAULT_SLIPPAGE_BPS);

    if (!walletId) throw new Error("walletId required");
    if (!mint || mint.length < 32) throw new Error("mint required");
    if (side !== "buy" && side !== "sell") throw new Error("side must be 'buy' or 'sell'");
    if (mint === SOL_MINT) throw new Error("cannot swap SOL → SOL");

    const { data: w, error: werr } = await admin
      .from("waterfall_wallets")
      .select("pubkey,secret_key_encrypted")
      .eq("id", walletId)
      .single();
    if (werr || !w) throw new Error("wallet not found");
    const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);
    const secretBytes = secret.trim().startsWith("[") ? new Uint8Array(JSON.parse(secret)) : bs58.decode(secret.trim());
    const kp = Keypair.fromSecretKey(secretBytes);
    if (kp.publicKey.toBase58() !== w.pubkey) throw new Error("key mismatch");

    const connection = new Connection(getHeliusRpcUrl(), "confirmed");

    if (side === "buy") {
      const bal = await connection.getBalance(kp.publicKey);
      if (bal < buyLamports + 5_000_000) {
        throw new Error(`insufficient SOL: have ${(bal / LAMPORTS_PER_SOL).toFixed(6)}, need ~${((buyLamports + 5_000_000) / LAMPORTS_PER_SOL).toFixed(6)}`);
      }
      const sig = await execSwap(connection, kp, SOL_MINT, mint, String(buyLamports), slippageBps);
      return new Response(JSON.stringify({ success: true, side, signature: sig, buyLamports }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      const mintPk = new PublicKey(mint);
      const raw = await getTokenBalanceRaw(connection, kp.publicKey, mintPk);
      if (raw <= 0n) throw new Error("no token balance to sell");
      const sig = await execSwap(connection, kp, mint, SOL_MINT, raw.toString(), slippageBps);
      return new Response(JSON.stringify({ success: true, side, signature: sig, soldRaw: raw.toString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("waterfall-swap", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});