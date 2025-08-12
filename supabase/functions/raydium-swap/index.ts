import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, PublicKey, VersionedTransaction, Transaction, Keypair } from "npm:@solana/web3.js@1.95.3";
// Lightweight ATA helper (avoid @solana/spl-token dependency)
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return addr;
}
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SWAP_HOST = "https://transaction-v1.raydium.io"; // compute + transaction host from docs

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

function isSolMint(m: string) {
  return m === NATIVE_MINT.toBase58() || m === "So11111111111111111111111111111111111111112";
}

function parseKeypair(secret: string): Keypair {
  try {
    const s = secret.trim();
    if (s.startsWith("[")) {
      const arr = JSON.parse(s) as number[];
      const u8 = new Uint8Array(arr);
      if (u8.length === 64) return Keypair.fromSecretKey(u8);
      if (u8.length === 32) return Keypair.fromSeed(u8);
      throw new Error(`bad secret key size: ${u8.length} bytes (expected 32 or 64)`);
    }
    const decoded = bs58.decode(s);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
    throw new Error(`bad secret key size: ${decoded.length} bytes (expected 32 or 64)`);
  } catch (e) {
    throw new Error(`Failed to parse TRADER_PRIVATE_KEY: ${(e as Error).message}`);
  }
}

async function getPriorityFeeMicroLamports(connection: Connection): Promise<number> {
  try {
    // Try Solana RPC recent prioritization fees
    // @ts-ignore: method available on supported RPCs
    const fees = await (connection as any).getRecentPrioritizationFees?.([]);
    if (Array.isArray(fees) && fees.length) {
      const vals = fees.map((f: any) => Number(f.prioritizationFee)).filter((n) => Number.isFinite(n));
      if (vals.length) {
        vals.sort((a, b) => a - b);
        const p90 = vals[Math.floor(vals.length * 0.9)];
        return Math.max(1000, Math.min(p90 || vals[vals.length - 1], 100000)); // clamp
      }
    }
  } catch (_) {
    // ignore
  }
  return 5000; // fallback
}

async function fetchSolUsdPrice(): Promise<number> {
  try {
    const r = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const j = await r.json();
    const p = Number(j?.data?.SOL?.price ?? j?.data?.wSOL?.price ?? j?.SOL?.price);
    if (Number.isFinite(p) && p > 0) return p;
  } catch (_) {}
  return 0;
}

async function tryJupiterSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps: number;
  userPublicKey: string;
  computeUnitPriceMicroLamports: number;
  asLegacy: boolean;
}): Promise<{ txs: string[] } | { error: string }> {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey, computeUnitPriceMicroLamports, asLegacy } = params;
    const qUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    const qRes = await fetch(qUrl);
    if (!qRes.ok) {
      const t = await qRes.text();
      return { error: `Jupiter quote failed: ${qRes.status} ${t}` };
    }
    const qJson = await qRes.json();
    // v6 sometimes returns { data: [route] }, sometimes a single object
    const quoteResponse = Array.isArray(qJson?.data) ? qJson.data[0] : qJson;
    if (!quoteResponse || (!quoteResponse.inAmount && !quoteResponse.routePlan)) {
      return { error: `Jupiter quote returned no routes` };
    }

    const sRes = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports,
        asLegacyTransaction: asLegacy,
        useTokenLedger: false,
        dynamicComputeUnitLimit: true,
      }),
    });
    if (!sRes.ok) {
      const t = await sRes.text();
      return { error: `Jupiter swap build failed: ${sRes.status} ${t}` };
    }
    const sJson = await sRes.json();
    const tx = sJson?.swapTransaction || sJson?.data?.swapTransaction;
    if (typeof tx !== "string") return { error: `Jupiter swap build returned no transaction` };
    return { txs: [tx] };
  } catch (e) {
    return { error: `Jupiter error: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("Use POST", 405);

  try {
    // Simple token guard (no Supabase Auth required). Provide x-function-token header to call.
    const fnToken = Deno.env.get("FUNCTION_TOKEN");
    if (fnToken) {
      const headerToken = req.headers.get("x-function-token") || (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
      if (headerToken !== fnToken) return bad("Unauthorized", 401);
    }

    const body = await req.json();
    const {
      inputMint: _inputMint,
      outputMint: _outputMint,
      amount: _amount,
      slippageBps = 100, // 1%
      txVersion = "V0",
      wrapSol = false,
      unwrapSol = false,
      // high-level params (optional)
      side,
      tokenMint,
      usdcAmount,
      sellAll,
    } = body;

    const rpcUrl = getEnv("SOLANA_RPC_URL");
    const ownerSecret = getEnv("TRADER_PRIVATE_KEY");
    const owner = parseKeypair(ownerSecret);
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });

    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    // Resolve low-level params
    let inputMint = _inputMint as string | undefined;
    let outputMint = _outputMint as string | undefined;
    let amount = _amount as number | string | undefined;

    if (side && tokenMint) {
      if (side === "buy") {
        inputMint = USDC_MINT;
        outputMint = tokenMint;
        const usd = Number(usdcAmount ?? 0);
        if (!Number.isFinite(usd) || usd <= 0) return bad("Invalid usdcAmount for buy");
        amount = Math.floor(usd * 1_000_000); // USDC has 6 decimals
      } else if (side === "sell") {
        inputMint = tokenMint;
        outputMint = USDC_MINT;
        if (sellAll) {
          const ata = await getAssociatedTokenAddress(new PublicKey(tokenMint), owner.publicKey);
          const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
          const raw = bal?.value?.amount ? Number(bal.value.amount) : 0;
          if (!Number.isFinite(raw) || raw <= 0) return bad("No token balance to sell");
          amount = Math.floor(raw);
        } else {
          if (amount == null) return bad("Provide amount when not sellAll");
        }
      } else {
        return bad("Invalid side; use 'buy' or 'sell'");
      }
    }

    if (!inputMint || !outputMint || amount == null) return bad("Missing inputMint, outputMint, amount");

    // Get ATAs when not SOL
    let isInputSol = isSolMint(String(inputMint));
    let isOutputSol = isSolMint(String(outputMint));

    let inputAccount = isInputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(inputMint), owner.publicKey)).toBase58();
    let outputAccount = isOutputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(outputMint), owner.publicKey)).toBase58();

    // Compute route (with SOL fallback for buys if USDC route lacks liquidity)
    let usedFallbackToSOL = false;
    let swapResponse: any;
    let needJupiter = false;
    let jupReason: string | undefined;
    {
      const computeUrl = `${SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=${txVersion}`;
      const computeRes = await fetch(computeUrl);
      if (!computeRes.ok) {
        const t = await computeRes.text();
        needJupiter = true;
        jupReason = `Raydium compute failed: ${computeRes.status} ${t}`;
      } else {
        const tmp = await computeRes.json();
        if (tmp?.success === false) {
          try { console.error("raydium-swap compute error", tmp); } catch {}
          const msg = String(tmp?.msg ?? "");
          if (msg.includes("INSUFFICIENT_LIQUIDITY") && side === "buy" && tokenMint && usdcAmount != null) {
            const usd = Number(usdcAmount ?? 0);
            const solPrice = await fetchSolUsdPrice();
            const approxPrice = solPrice > 0 ? solPrice : 200; // conservative default if price feed hiccups
            let wantedLamports = Math.floor((usd / approxPrice) * 1_000_000_000);

            // Reserve a small amount for fees when spending SOL directly
            const feeReserveLamports = 10_000_000; // 0.01 SOL

            let solBal: number | null = null;
            try { solBal = await connection.getBalance(owner.publicKey); } catch { solBal = null; }

            let lamports = wantedLamports;
            if (solBal !== null) {
              const spendable = Math.max(0, solBal - feeReserveLamports);
              lamports = Math.min(wantedLamports, spendable);
            }

            if (!Number.isFinite(lamports) || lamports <= 0) {
              needJupiter = true;
              jupReason = `Not enough SOL balance to perform SOL-route buy for ${owner.publicKey.toBase58()}`;
            } else {
              inputMint = NATIVE_MINT.toBase58();
              outputMint = tokenMint;
              amount = lamports;
              isInputSol = true;
              isOutputSol = isSolMint(String(outputMint));
              // Recompute output account for token; input account is native SOL
              inputAccount = undefined;
              const outAta = await getAssociatedTokenAddress(new PublicKey(outputMint), owner.publicKey);
              outputAccount = outAta.toBase58();
              const computeUrl2 = `${SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=${txVersion}`;
              const computeRes2 = await fetch(computeUrl2);
              if (!computeRes2.ok) {
                const t2 = await computeRes2.text();
                needJupiter = true;
                jupReason = `Raydium compute failed (SOL fallback): ${computeRes2.status} ${t2}`;
              } else {
                const solResp = await computeRes2.json();
                if (solResp?.success === false) {
                  try { console.error("raydium-swap compute error (SOL fallback)", solResp); } catch {}
                  needJupiter = true;
                  jupReason = `Raydium compute error (SOL fallback): ${solResp?.msg ?? "unknown"}`;
                } else {
                  swapResponse = solResp;
                  usedFallbackToSOL = true;
                }
              }
            }
          } else {
            needJupiter = true;
            jupReason = `Raydium compute error: ${tmp?.msg ?? "unknown"}`;
          }
        } else {
          swapResponse = tmp;
        }
      }
    }

    // Priority fee
    const computeUnitPriceMicroLamports = await getPriorityFeeMicroLamports(connection);

    // Jupiter fallback if Raydium compute failed at compute stage
    if (needJupiter) {
      const j = await tryJupiterSwap({
        inputMint: String(inputMint),
        outputMint: String(outputMint),
        amount: amount as any,
        slippageBps: Number(slippageBps),
        userPublicKey: owner.publicKey.toBase58(),
        computeUnitPriceMicroLamports,
        asLegacy: String(txVersion).toUpperCase() === "LEGACY",
      });
      if ("txs" in j) {
        const sigs: string[] = [];
        if (String(txVersion).toUpperCase() === "LEGACY") {
          for (const b64 of j.txs) {
            const buf = Buffer.from(b64, "base64");
            const tx = Transaction.from(buf);
            tx.sign(owner);
            const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
            sigs.push(sig);
          }
        } else {
          for (const b64 of j.txs) {
            const buf = Buffer.from(b64, "base64");
            const vtx = VersionedTransaction.deserialize(buf);
            vtx.sign([owner]);
            const sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 3 });
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
            sigs.push(sig);
          }
        }
        return ok({ signatures: sigs });
      } else {
        return bad(`${jupReason ?? "Raydium compute failed"}; Jupiter fallback: ${j.error}`, 502);
      }
    }

    // Build transactions (first try)
    let signVersion = txVersion as string;
    let lastBuilderErrorMessage: string | undefined;
    const txRes = await fetch(`${SWAP_HOST}/transaction/swap-base-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        computeUnitPriceMicroLamports,
        swapResponse,
        txVersion,
        wallet: owner.publicKey.toBase58(),
        wrapSol: Boolean((wrapSol || usedFallbackToSOL) && isInputSol),
        unwrapSol: Boolean(unwrapSol && isOutputSol),
        inputAccount,
        outputAccount,
      }),
    });

    if (!txRes.ok) {
      const t = await txRes.text();
      return bad(`Raydium transaction build failed: ${txRes.status} ${t}`, 502);
    }

    const txJson = await txRes.json();
    if (txJson && txJson.success === false && txJson.msg) {
      try { console.error("raydium-swap builder error", txJson); } catch {}
      lastBuilderErrorMessage = txJson.msg;
    }
    let txPayloads: any[] = [];
    if (Array.isArray(txJson?.data)) txPayloads = txJson.data;
    else if (txJson?.data?.transaction) txPayloads = [txJson.data.transaction];
    else if (typeof txJson?.data === "string") txPayloads = [txJson.data];
    else if (Array.isArray(txJson?.transactions)) txPayloads = txJson.transactions;
    else if (txJson?.transaction) txPayloads = [txJson.transaction];

    let txList: { transaction: string }[] = txPayloads.map((d: any) => ({ transaction: (d?.transaction ?? d) }));

    if (!Array.isArray(txList) || txList.length === 0) {
      // Try LEGACY as a fallback
      try {
        const computeUrl2 = `${SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=LEGACY`;
        const computeRes2 = await fetch(computeUrl2);
        if (computeRes2.ok) {
          const swapResponse2 = await computeRes2.json();
          const txRes2 = await fetch(`${SWAP_HOST}/transaction/swap-base-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              computeUnitPriceMicroLamports,
              swapResponse: swapResponse2,
              txVersion: "LEGACY",
              wallet: owner.publicKey.toBase58(),
              wrapSol: Boolean((wrapSol || usedFallbackToSOL) && isInputSol),
              unwrapSol: Boolean(unwrapSol && isOutputSol),
              inputAccount,
              outputAccount,
            }),
          });
          if (txRes2.ok) {
            const txJson2 = await txRes2.json();
            if (txJson2 && txJson2.success === false && txJson2.msg) {
              try { console.error("raydium-swap builder error (LEGACY)", txJson2); } catch {}
              lastBuilderErrorMessage = txJson2.msg;
            }
            let txPayloads2: any[] = [];
            if (Array.isArray(txJson2?.data)) txPayloads2 = txJson2.data;
            else if (txJson2?.data?.transaction) txPayloads2 = [txJson2.data.transaction];
            else if (typeof txJson2?.data === "string") txPayloads2 = [txJson2.data];
            else if (Array.isArray(txJson2?.transactions)) txPayloads2 = txJson2.transactions;
            else if (txJson2?.transaction) txPayloads2 = [txJson2.transaction];
            const tmpList = txPayloads2.map((d: any) => ({ transaction: (d?.transaction ?? d) }));
            if (Array.isArray(tmpList) && tmpList.length > 0) {
              txList = tmpList;
              signVersion = "LEGACY";
            }
          }
        }
      } catch {}

      if (!Array.isArray(txList) || txList.length === 0) {
        try {
          console.error("raydium-swap empty tx list", {
            keys: Object.keys(txJson || {}),
            preview: typeof txJson === "object" ? JSON.stringify(txJson).slice(0, 200) : String(txJson).slice(0, 200),
            lastBuilderErrorMessage,
          });
        } catch {}
        return bad(`No transactions returned from Raydium${lastBuilderErrorMessage ? `: ${lastBuilderErrorMessage}` : ""}`, 502);
      }
    }

    const sigs: string[] = [];

    if (signVersion === "V0") {
      for (const item of txList) {
        const buf = Buffer.from(item.transaction, "base64");
        const vtx = VersionedTransaction.deserialize(buf);
        vtx.sign([owner]);
        const sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 3 });
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
        sigs.push(sig);
      }
    } else {
      for (const item of txList) {
        const buf = Buffer.from(item.transaction, "base64");
        const tx = Transaction.from(buf);
        tx.sign(owner);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
        sigs.push(sig);
      }
    }

    return ok({ signatures: sigs });
  } catch (e) {
    console.error("raydium-swap error", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
