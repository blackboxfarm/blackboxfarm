import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from "npm:@solana/web3.js@1.95.3";
import { getAssociatedTokenAddress, getAccount } from "npm:@solana/spl-token@0.4.8";

export const TROLL_MINT = "5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2";
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const DEFAULT_BUY_LAMPORTS = 300_000; // ~$0.02 at $68/SOL
export const DEFAULT_SLIPPAGE_BPS = 500;

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

async function execSwap(
  connection: Connection,
  kp: Keypair,
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number,
) {
  const quote = await jupQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps: String(slippageBps),
    onlyDirectRoutes: "false",
  });
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

export interface TrollCycleResult {
  i: number;
  buy?: string;
  sell?: string;
  attempts: number;
  error?: string;
  ms: number;
}

export interface RunTrollOptions {
  cycles?: number;
  gapMs?: number;
  buyLamports?: number;
  slippageBps?: number;
  maxAttemptsPerCycle?: number;
  onProgress?: (msg: string) => void | Promise<void>;
}

/**
 * Runs `cycles` successful buy+sell cycles of TROLL.
 * Retries each cycle until it succeeds or maxAttemptsPerCycle is hit.
 */
export async function runTrollCycles(
  connection: Connection,
  kp: Keypair,
  opts: RunTrollOptions = {},
): Promise<{ cycles: TrollCycleResult[]; successCount: number }> {
  const cycles = opts.cycles ?? 10;
  const gapMs = opts.gapMs ?? 5000;
  const buyLamports = opts.buyLamports ?? DEFAULT_BUY_LAMPORTS;
  const slippageBps = opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const maxAttempts = opts.maxAttemptsPerCycle ?? 20;
  const mintPk = new PublicKey(TROLL_MINT);

  const results: TrollCycleResult[] = [];
  let successCount = 0;

  for (let i = 1; i <= cycles; i++) {
    const cStart = Date.now();
    const entry: TrollCycleResult = { i, attempts: 0, ms: 0 };
    let ok = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      entry.attempts = attempt;
      try {
        if (opts.onProgress) await opts.onProgress(`cycle ${i}/${cycles} attempt ${attempt} buy`);
        const buySig = await execSwap(connection, kp, SOL_MINT, TROLL_MINT, String(buyLamports), slippageBps);
        entry.buy = buySig;
        await sleep(1500);
        const trollBal = await getTokenBalanceRaw(connection, kp.publicKey, mintPk);
        if (trollBal <= 0n) throw new Error("no TROLL received from buy");
        if (opts.onProgress) await opts.onProgress(`cycle ${i}/${cycles} attempt ${attempt} sell`);
        const sellSig = await execSwap(connection, kp, TROLL_MINT, SOL_MINT, trollBal.toString(), slippageBps);
        entry.sell = sellSig;
        entry.error = undefined;
        ok = true;
        break;
      } catch (e) {
        entry.error = (e as Error).message;
        console.warn(`[troll-cycle] cycle ${i} attempt ${attempt} failed: ${entry.error}`);
        await sleep(2000); // small backoff before retry
      }
    }

    entry.ms = Date.now() - cStart;
    results.push(entry);
    if (ok) successCount++;
    if (i < cycles) await sleep(gapMs);
  }

  return { cycles: results, successCount };
}