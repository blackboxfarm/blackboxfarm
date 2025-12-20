import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, PublicKey, VersionedTransaction, Transaction, Keypair, SystemProgram, TransactionInstruction } from "https://esm.sh/@solana/web3.js@1.95.3?target=deno";
import { SecureStorage } from '../_shared/encryption.ts';
// Lightweight ATA helper (avoid @solana/spl-token dependency)
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey, programId: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return addr;
}

// Helper to get token accounts by owner (tries both token programs)
async function getTokenBalance(connection: Connection, mint: PublicKey, owner: PublicKey): Promise<{ balance: number; programId: PublicKey } | null> {
  // Try Token-2022 first (pump.fun tokens use this)
  const ata2022 = getAssociatedTokenAddress(mint, owner, TOKEN_2022_PROGRAM_ID);
  try {
    const bal = await connection.getTokenAccountBalance(ata2022);
    if (bal?.value?.amount) {
      console.log("Found balance with Token-2022:", bal.value.amount);
      return { balance: Number(bal.value.amount), programId: TOKEN_2022_PROGRAM_ID };
    }
  } catch (e) {
    console.log("Token-2022 ATA not found:", (e as Error)?.message?.slice(0, 100));
  }
  
  // Try standard SPL Token
  const ataSpl = getAssociatedTokenAddress(mint, owner, TOKEN_PROGRAM_ID);
  try {
    const bal = await connection.getTokenAccountBalance(ataSpl);
    if (bal?.value?.amount) {
      console.log("Found balance with SPL Token:", bal.value.amount);
      return { balance: Number(bal.value.amount), programId: TOKEN_PROGRAM_ID };
    }
  } catch (e) {
    console.log("SPL Token ATA not found:", (e as Error)?.message?.slice(0, 100));
  }
  
  return null;
}
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC (mainnet)
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-token, x-owner-secret",
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

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Try PumpPortal API for pump.fun bonding curve tokens
async function tryPumpPortalSell(params: {
  mint: string;
  sellerPublicKey: string;
  sellAll: boolean;
  slippageBps: number;
}): Promise<{ tx: Uint8Array } | { error: string }> {
  try {
    const { mint, sellerPublicKey, slippageBps } = params;
    
    const requestBody = {
      publicKey: sellerPublicKey,
      action: "sell",
      mint: mint,
      denominatedInSol: "false",
      amount: "100%",
      slippage: 25,
      priorityFee: 0.0005,
      pool: "auto" // Use "auto" to automatically detect the right exchange
    };
    
    console.log("PumpPortal request:", JSON.stringify(requestBody));
    
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    
    if (response.status === 200) {
      const data = await response.arrayBuffer();
      console.log("PumpPortal transaction generated, size:", data.byteLength);
      return { tx: new Uint8Array(data) };
    } else {
      const errorText = await response.text();
      console.log("PumpPortal error:", response.status, errorText);
      return { error: `PumpPortal: ${response.status} - ${errorText}` };
    }
  } catch (e) {
    console.log("PumpPortal exception:", (e as Error).message);
    return { error: `PumpPortal error: ${(e as Error).message}` };
  }
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
    
    // Try multiple Jupiter endpoints (some work better in edge environments)
    const jupiterHosts = [
      "https://api.jup.ag",           // Main API
      "https://quote-api.jup.ag",     // Quote API
      "https://lite-api.jup.ag",      // Lite API
    ];
    
    let lastError = "";
    
    for (const host of jupiterHosts) {
      try {
        console.log(`Trying Jupiter host: ${host}`);
        const qUrl = `${host}/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactIn`;
        
        const qRes = await fetch(qUrl, {
          headers: { "Accept": "application/json" },
        });
        
        if (!qRes.ok) {
          const t = await qRes.text();
          lastError = `Jupiter quote failed (${host}): ${qRes.status} ${t}`;
          console.log(lastError);
          continue;
        }
        
        const qJson = await qRes.json();
        const quoteResponse = Array.isArray(qJson?.data) ? qJson.data[0] : qJson;
        if (!quoteResponse || (!quoteResponse.inAmount && !quoteResponse.routePlan)) {
          lastError = `Jupiter quote returned no routes from ${host}`;
          console.log(lastError);
          continue;
        }
        
        console.log("Jupiter quote success, building swap transaction...");

        const sRes = await fetch(`${host}/v6/swap`, {
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
          lastError = `Jupiter swap build failed (${host}): ${sRes.status} ${t}`;
          console.log(lastError);
          continue;
        }
        
        const sJson = await sRes.json();
        const tx = sJson?.swapTransaction || sJson?.data?.swapTransaction;
        if (typeof tx !== "string") {
          lastError = `Jupiter swap build returned no transaction from ${host}`;
          console.log(lastError);
          continue;
        }
        
        console.log("Jupiter swap transaction built successfully");
        return { txs: [tx] };
      } catch (hostError) {
        lastError = `Jupiter error (${host}): ${(hostError as Error).message}`;
        console.log(lastError);
        continue;
      }
    }
    
    return { error: `All Jupiter endpoints failed. Last error: ${lastError}` };
  } catch (e) {
    return { error: `Jupiter error: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("Use POST", 405);

  // Declare variables at function scope for error handling
  let inputMint: string | undefined;
  let outputMint: string | undefined;
  let amount: number | string | undefined;
  let owner: Keypair | undefined;

  try {
    // Authentication via x-owner-secret header or ownerSecret body param
    // The x-function-token check is disabled as we validate via the encrypted wallet secret

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
      // fast mode and fee override
      confirmPolicy: _confirmPolicy,
      computeUnitPriceMicroLamports: _feeOverride,
      priorityFeeMicroLamports: _altFeeOverride,
      action,
      preCreateWSOL,
    } = body;

    const rpcUrl = getEnv("SOLANA_RPC_URL");
    const bodyOwnerSecret = (body?.ownerSecret ? String(body.ownerSecret) : null);
    const headerSecret = req.headers.get("x-owner-secret");
    const envOwnerSecret = getEnv("TRADER_PRIVATE_KEY");
    
    // Decrypt if it's from header (encrypted from database)
    let secretToUse = bodyOwnerSecret || envOwnerSecret;
    if (headerSecret) {
      // First, try using the header secret directly as base58 (for airdrop wallets)
      try {
        const decoded = bs58.decode(headerSecret.trim());
        if (decoded.length === 64 || decoded.length === 32) {
          // It's a valid base58-encoded secret key, use it directly
          secretToUse = headerSecret;
        } else {
          throw new Error("Invalid key length");
        }
      } catch {
        // Not a base58 key, try to decrypt it
        try {
          secretToUse = await SecureStorage.decryptWalletSecret(headerSecret);
        } catch (error) {
          return bad(`Failed to decrypt wallet secret: ${error instanceof Error ? error.message : String(error)}`, 400);
        }
      }
    }
    
    // Handle base64 encoded secrets (from user_secrets table)
    if (secretToUse && secretToUse.includes('\n')) {
      try {
        // This looks like a base64 encoded secret, decode it
        const decoded = atob(secretToUse.replace(/\s/g, ''));
        secretToUse = decoded;
      } catch (error) {
        console.log('Base64 decode failed, trying as-is:', error);
      }
    }
    
    owner = parseKeypair(secretToUse);
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });

    const confirmPolicy = String(_confirmPolicy ?? "processed").toLowerCase();
    const desiredCommitment = confirmPolicy === "processed" ? "processed" : "confirmed";

    // Prepare mode: pre-create ATAs to speed up first swap
    if (action === "prepare") {
      try {
        const instrs: TransactionInstruction[] = [];
        const created: Record<string, boolean> = {};
        const mints: string[] = [];
        if (tokenMint) mints.push(String(tokenMint));
        if (preCreateWSOL) mints.push(NATIVE_MINT.toBase58());
        for (const m of mints) {
          try {
            const mintPk = new PublicKey(m);
            const ata = getAssociatedTokenAddress(mintPk, owner.publicKey);
            const info = await connection.getAccountInfo(ata);
            if (!info) {
              const keys = [
                { pubkey: owner.publicKey, isSigner: true, isWritable: true },
                { pubkey: ata, isSigner: false, isWritable: true },
                { pubkey: owner.publicKey, isSigner: false, isWritable: false },
                { pubkey: mintPk, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              ];
              instrs.push(new TransactionInstruction({ programId: ASSOCIATED_TOKEN_PROGRAM_ID, keys, data: undefined }));
              created[m] = true;
            } else {
              created[m] = false;
            }
          } catch (e) {
            created[m] = false;
          }
        }
        if (instrs.length) {
          const tx = new Transaction().add(...instrs);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          tx.feePayer = owner.publicKey;
          tx.sign(owner);
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
            if (confirmPolicy !== "none") {
              if (confirmPolicy === "processed") {
                await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "processed" as any);
                // Background confirmation (removed EdgeRuntime dependency)
              } else {
                await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed" as any);
              }
            }
          return ok({ prepared: true, signatures: [sig], created });
        }
        return ok({ prepared: true, signatures: [], created });
      } catch (e) {
        return bad(`Prepare failed: ${(e as Error).message}`, 500);
      }
    }

    // Resolve low-level params
    inputMint = _inputMint as string | undefined;
    outputMint = _outputMint as string | undefined;
    amount = _amount as number | string | undefined;

    if (side && tokenMint) {
      if (side === "buy") {
        const buyWithSol = Boolean(body?.buyWithSol);
        if (buyWithSol) {
          const usd = Number(usdcAmount ?? 0);
          if (!Number.isFinite(usd) || usd <= 0) return bad("Invalid usdcAmount for buy");
          const solPrice = await fetchSolUsdPrice();
          const approxPrice = solPrice > 0 ? solPrice : 200;
            let wantedLamports = Math.floor((usd / approxPrice) * 1_000_000_000);
            const feeReserveLamports = 1_000_000; // 0.001 SOL (reduced for micro-buys)
          let solBal: number | null = null;
          try { solBal = await connection.getBalance(owner.publicKey); } catch { solBal = null; }
          let lamports = wantedLamports;
          if (solBal !== null) {
            const spendable = Math.max(0, solBal - feeReserveLamports);
            lamports = Math.min(wantedLamports, spendable);
          }
          if (!Number.isFinite(lamports) || lamports <= 0) return bad("Not enough SOL balance to buy with SOL");
          inputMint = NATIVE_MINT.toBase58();
          outputMint = tokenMint;
          amount = lamports;
        } else {
          inputMint = USDC_MINT;
          outputMint = tokenMint;
          const usd = Number(usdcAmount ?? 0);
          if (!Number.isFinite(usd) || usd <= 0) return bad("Invalid usdcAmount for buy");
          amount = Math.floor(usd * 1_000_000); // USDC has 6 decimals
        }
      } else if (side === "sell") {
        inputMint = tokenMint;
        // For pump.fun tokens, sell to SOL since they don't have USDC pairs
        const isPumpToken = tokenMint.endsWith('pump') || tokenMint.includes('pump');
        outputMint = isPumpToken ? NATIVE_MINT.toBase58() : USDC_MINT;
        if (sellAll) {
          console.log("Sell debug:", {
            ownerPubkey: owner.publicKey.toBase58(),
            tokenMint
          });
          
          // Use public RPC for balance check (Helius key may be invalid)
          const publicConnection = new Connection("https://api.mainnet-beta.solana.com", { commitment: "confirmed" });
          
          // Try both Token-2022 and SPL Token programs
          const balanceResult = await getTokenBalance(publicConnection, new PublicKey(tokenMint), owner.publicKey);
          
          if (!balanceResult || balanceResult.balance <= 0) {
            return bad(`No token balance to sell. Owner: ${owner.publicKey.toBase58().slice(0,8)}..., tried both Token-2022 and SPL Token programs`);
          }
          
          console.log("Found token balance:", balanceResult.balance, "using program:", balanceResult.programId.toBase58());
          amount = Math.floor(balanceResult.balance);
        } else {
          if (amount == null) return bad("Provide amount when not sellAll");
        }
      } else {
        return bad("Invalid side; use 'buy' or 'sell'");
      }
    }

    if (!inputMint || !outputMint || amount == null) return bad("Missing inputMint, outputMint, amount");

    // Debug logging
    console.log("Debug swap params:", {
      inputMint: String(inputMint),
      outputMint: String(outputMint), 
      amount: String(amount),
      side,
      tokenMint,
      usdcAmount,
      ownerPubkey: owner.publicKey.toBase58()
    });

    // Initialize Jupiter routing variables first
    let needJupiter = false;
    let jupReason: string | undefined;

    // For pump.fun tokens or tokens with routing issues, use Jupiter directly
    const isPumpFunToken = (mintAddress: string) => {
      return mintAddress.endsWith('pump') || mintAddress.length === 44;
    };
    
    const shouldUseJupiter = isPumpFunToken(String(tokenMint)) || 
                            (tokenMint && String(tokenMint).includes('pump'));
    
    if (shouldUseJupiter) {
      console.log('Detected pump.fun or problematic token, using Jupiter directly');
      needJupiter = true;
      jupReason = 'Pump.fun token detected - using Jupiter for better routing';
    }

    // Get ATAs when not SOL
    let isInputSol = isSolMint(String(inputMint));
    let isOutputSol = isSolMint(String(outputMint));

    let inputAccount = isInputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(inputMint), owner.publicKey)).toBase58();
    let outputAccount = isOutputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(outputMint), owner.publicKey)).toBase58();

    // Compute route (with SOL fallback for buys if USDC route lacks liquidity)
    let usedFallbackToSOL = false;
    let swapResponse: any;
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
            const feeReserveLamports = 1_000_000; // 0.001 SOL (reduced for micro-buys)

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
              if (!outputMint) {
                throw new Error('Output mint is required for SOL to token swap');
              }
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

    // Priority fee (allow override)
    let computeUnitPriceMicroLamports = Number(_feeOverride ?? _altFeeOverride ?? 0);
    if (!Number.isFinite(computeUnitPriceMicroLamports) || computeUnitPriceMicroLamports <= 0) {
      computeUnitPriceMicroLamports = await getPriorityFeeMicroLamports(connection);
    }
    // Clamp to 5k–50k µLamports to control cost and reduce expiry risk
    computeUnitPriceMicroLamports = Math.min(Math.max(computeUnitPriceMicroLamports, 5_000), 50_000);

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
            const u8 = b64ToU8(b64);
            const tx = Transaction.from(u8 as any);
            // Refresh blockhash BEFORE signing, then confirm using the same pair
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            if (!tx.feePayer) tx.feePayer = owner.publicKey;
            tx.sign(owner);
            let sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
            try {
            if (confirmPolicy !== "none") {
              if (confirmPolicy === "processed") {
                await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "processed" as any);
                // Background confirmation
              } else {
                await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed" as any);
              }
            }
          } catch (e) {
            // Retry once on expired blockhash
            const msg = String((e as Error)?.message || e);
            if (msg.includes("expired") || msg.includes("block height exceeded")) {
              const fresh = await connection.getLatestBlockhash("confirmed");
              tx.recentBlockhash = fresh.blockhash;
              tx.sign(owner);
              sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
              if (confirmPolicy !== "none") {
                if (confirmPolicy === "processed") {
                  await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "processed" as any);
                  // Background confirmation
                } else {
                  await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "confirmed" as any);
                }
              }
            } else {
              throw e;
            }
          }
            sigs.push(sig);
          }
        } else {
          for (const b64 of j.txs) {
            const u8 = b64ToU8(b64);
            const vtx = VersionedTransaction.deserialize(u8);
            // Refresh blockhash BEFORE signing, then confirm using the same pair
            const fresh = await connection.getLatestBlockhash("confirmed");
            // @ts-ignore - message is mutable in this context
            (vtx as any).message.recentBlockhash = fresh.blockhash;
            vtx.sign([owner]);
            let sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
            try {
              if (confirmPolicy !== "none") {
                if (confirmPolicy === "processed") {
                  await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "processed" as any);
                  // Background confirmation
                } else {
                  await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "confirmed" as any);
                }
              }
            } catch (e) {
              const msg = String((e as Error)?.message || e);
              if (msg.includes("expired") || msg.includes("block height exceeded")) {
                const newer = await connection.getLatestBlockhash("confirmed");
                (vtx as any).message.recentBlockhash = newer.blockhash;
                vtx.sign([owner]);
                sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
                if (confirmPolicy !== "none") {
                  if (confirmPolicy === "processed") {
                    await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "processed" as any);
                    // Background confirmation
                  } else {
                    await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "confirmed" as any);
                  }
                }
              } else {
                throw e;
              }
            }
            sigs.push(sig);
          }
        }
        return ok({ signatures: sigs });
      } else {
        // Jupiter also failed - try PumpPortal for pump.fun tokens as last resort
        const isPumpToken = tokenMint && (String(tokenMint).endsWith('pump') || String(tokenMint).includes('pump'));
        if (isPumpToken && side === "sell" && amount) {
          console.log("Raydium and Jupiter failed, trying PumpPortal for pump.fun bonding curve token...");
          
          const pumpResult = await tryPumpPortalSell({
            mint: String(tokenMint),
            sellerPublicKey: owner.publicKey.toBase58(),
            sellAll: Boolean(sellAll),
            slippageBps: Number(slippageBps),
          });
          
          if ("tx" in pumpResult) {
            try {
              const vtx = VersionedTransaction.deserialize(pumpResult.tx);
              vtx.sign([owner]);
              
              // Use public RPC for PumpPortal transactions (avoid Helius auth issues)
              const publicRpc = new Connection("https://api.mainnet-beta.solana.com", { commitment: "confirmed" });
              const { blockhash, lastValidBlockHeight } = await publicRpc.getLatestBlockhash("confirmed");
              
              // Update blockhash before sending
              (vtx as any).message.recentBlockhash = blockhash;
              vtx.sign([owner]); // Re-sign with new blockhash
              
              const sig = await publicRpc.sendTransaction(vtx, { skipPreflight: true, maxRetries: 3 });
              
              if (confirmPolicy !== "none") {
                await publicRpc.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, confirmPolicy as any);
              }
              
              console.log("PumpPortal sell successful:", sig);
              return ok({ signatures: [sig], source: "pumpportal" });
            } catch (sendError) {
              console.error("PumpPortal transaction send failed:", (sendError as Error).message);
              return bad(`All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; PumpPortal: ${(sendError as Error).message}`, 502);
            }
          } else {
            return bad(`All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; PumpPortal: ${pumpResult.error}`, 502);
          }
        }
        
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
        // Fallback to Jupiter when Raydium builder returns no transactions
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
          txList = j.txs.map((b64) => ({ transaction: b64 }));
          signVersion = String(txVersion).toUpperCase() === "LEGACY" ? "LEGACY" : "V0";
        } else {
          return bad(`No transactions returned from Raydium${lastBuilderErrorMessage ? `: ${lastBuilderErrorMessage}` : ""}; Jupiter fallback: ${j.error}`, 502);
        }
      }
    }

    const sigs: string[] = [];

    if (signVersion === "V0") {
      for (const item of txList) {
        const u8 = b64ToU8(item.transaction);
        const vtx = VersionedTransaction.deserialize(u8);
        // Fresh blockhash before signing
        const fresh = await connection.getLatestBlockhash("confirmed");
        // @ts-ignore
        (vtx as any).message.recentBlockhash = fresh.blockhash;
        vtx.sign([owner]);
        let sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
        try {
          if (confirmPolicy !== "none") {
            if (confirmPolicy === "processed") {
              await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "processed" as any);
              // Background confirmation
            } else {
              await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "confirmed" as any);
            }
          }
        } catch (e) {
          const msg = String((e as Error)?.message || e);
          if (msg.includes("expired") || msg.includes("block height exceeded")) {
            const newer = await connection.getLatestBlockhash("confirmed");
            (vtx as any).message.recentBlockhash = newer.blockhash;
            vtx.sign([owner]);
            sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
            if (confirmPolicy !== "none") {
              if (confirmPolicy === "processed") {
                await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "processed" as any);
                // Background confirmation
              } else {
                await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "confirmed" as any);
              }
            }
          } else {
            throw e;
          }
        }
        sigs.push(sig);
      }
    } else {
      for (const item of txList) {
        const u8 = b64ToU8(item.transaction);
        const tx = Transaction.from(u8 as any);
        // Fresh blockhash before signing
        const fresh = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = fresh.blockhash;
        if (!tx.feePayer) tx.feePayer = owner.publicKey;
        tx.sign(owner);
        let sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
        try {
          if (confirmPolicy !== "none") {
            if (confirmPolicy === "processed") {
              await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "processed" as any);
              // Background confirmation
            } else {
              await connection.confirmTransaction({ blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight, signature: sig }, "confirmed" as any);
            }
          }
        } catch (e) {
          const msg = String((e as Error)?.message || e);
          if (msg.includes("expired") || msg.includes("block height exceeded")) {
            const newer = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = newer.blockhash;
            tx.sign(owner);
            sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
            if (confirmPolicy !== "none") {
              if (confirmPolicy === "processed") {
                await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "processed" as any);
                // Background confirmation
              } else {
                await connection.confirmTransaction({ blockhash: newer.blockhash, lastValidBlockHeight: newer.lastValidBlockHeight, signature: sig }, "confirmed" as any);
              }
            }
          } else {
            throw e;
          }
        }
        sigs.push(sig);
      }
    }

    return ok({ signatures: sigs });
  } catch (e) {
    console.error("raydium-swap error", e);
    console.error("Error details:", {
      message: (e as Error).message,
      stack: (e as Error).stack,
      inputMint: inputMint || 'undefined',
      outputMint: outputMint || 'undefined', 
      amount: amount || 'undefined',
      ownerPubkey: owner?.publicKey?.toBase58() || 'undefined'
    });
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
