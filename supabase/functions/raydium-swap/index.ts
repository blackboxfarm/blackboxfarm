import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  PublicKey,
  VersionedTransaction,
  Transaction,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from "npm:@solana/web3.js@1.95.3";
import { SecureStorage } from "../_shared/encryption.ts";
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
async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<{ balance: number; programId: PublicKey } | null> {
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

function softError(code: string, message: string) {
  // Return 200 so callers can reliably read the error payload.
  return ok({ error: message, error_code: code }, 200);
}

// HARD CONFIRMATION: Ensures transaction actually landed on-chain
// Returns { confirmed: true, signature } or { confirmed: false, error }
async function hardConfirmTransaction(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
  timeoutMs: number = 30000
): Promise<{ confirmed: boolean; error?: string }> {
  const startTime = Date.now();
  
  try {
    // First try the standard confirmTransaction with a timeout
    const confirmPromise = connection.confirmTransaction(
      { blockhash, lastValidBlockHeight, signature },
      "confirmed" as any
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("CONFIRM_TIMEOUT")), timeoutMs)
    );
    
    const result = await Promise.race([confirmPromise, timeoutPromise]);
    
    if (result.value?.err) {
      return { 
        confirmed: false, 
        error: `TX_FAILED_ON_CHAIN: ${JSON.stringify(result.value.err)}` 
      };
    }
    
    return { confirmed: true };
  } catch (e) {
    const errMsg = (e as Error).message || String(e);
    console.log(`Initial confirmation failed (${errMsg}), checking signature status...`);
    
    // Fallback: Poll getSignatureStatuses for definitive answer
    const pollInterval = 2000;
    const maxPolls = Math.ceil((timeoutMs - (Date.now() - startTime)) / pollInterval);
    
    for (let i = 0; i < Math.max(maxPolls, 3); i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResult = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true
        });
        
        const status = statusResult.value[0];
        
        if (status) {
          if (status.err) {
            return { 
              confirmed: false, 
              error: `TX_FAILED_ON_CHAIN: ${JSON.stringify(status.err)}` 
            };
          }
          
          // Check if confirmed or finalized
          if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
            console.log(`Transaction ${signature.slice(0,8)} confirmed via status poll (${status.confirmationStatus})`);
            return { confirmed: true };
          }
          
          // Still processing
          console.log(`Transaction ${signature.slice(0,8)} status: ${status.confirmationStatus}, poll ${i+1}/${maxPolls}`);
        } else {
          // Transaction not found in ledger
          console.log(`Transaction ${signature.slice(0,8)} not found, poll ${i+1}/${maxPolls}`);
        }
        
        // Check if block height exceeded (transaction expired)
        try {
          const currentHeight = await connection.getBlockHeight();
          if (currentHeight > lastValidBlockHeight) {
            return { 
              confirmed: false, 
              error: `TX_EXPIRED: Block height ${currentHeight} > lastValid ${lastValidBlockHeight}. Transaction dropped.` 
            };
          }
        } catch {}
        
      } catch (pollErr) {
        console.log(`Status poll ${i+1} error: ${(pollErr as Error).message}`);
      }
    }
    
    // After all retries, if we still don't have confirmation, it's a failure
    return { 
      confirmed: false, 
      error: `TX_NOT_CONFIRMED: Transaction ${signature.slice(0,12)} was sent but never confirmed within ${timeoutMs}ms. It may have been dropped.` 
    };
  }
}

function readU64LE(bytes: Uint8Array): number {
  if (bytes.length < 8) return 0;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
  const n = dv.getBigUint64(0, true);
  const asNum = Number(n);
  return Number.isFinite(asNum) ? asNum : 0;
}

async function scanTokenAccountsBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<{ balance: number; programId: PublicKey } | null> {
  const programs = [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID];

  for (const programId of programs) {
    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(owner, { programId });
      let total = 0;

      for (const acc of tokenAccounts.value) {
        const data = acc.account.data as unknown as Uint8Array;
        if (!data || data.length < 72) continue;

        try {
          const acctMint = new PublicKey(data.slice(0, 32));
          if (acctMint.equals(mint)) {
            total += readU64LE(data.slice(64, 72));
          }
        } catch {
          // ignore malformed accounts
        }
      }

      if (total > 0) {
        console.log(`Found balance via token account scan (${programId.toBase58()}):`, total);
        return { balance: total, programId };
      }
    } catch (e) {
      console.log("Token account scan failed:", (e as Error)?.message?.slice(0, 140));
    }
  }

  return null;
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
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  try {
    const r = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const j = await r.json();
    const p = Number(j?.data?.['So11111111111111111111111111111111111111112']?.price);
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

// Try PumpPortal API for pump.fun/bonk.fun bonding curve tokens
async function tryPumpPortalTrade(params: {
  mint: string;
  userPublicKey: string;
  action: 'buy' | 'sell';
  amount: string; // For buy: SOL amount like "0.01", for sell: "100%" or token amount
  slippageBps: number;
  pool?: 'pump' | 'bonk' | 'auto'; // Which launchpad pool to use
}): Promise<{ tx: Uint8Array } | { error: string }> {
  try {
    const { mint, userPublicKey, action, amount, slippageBps, pool = 'auto' } = params;
    
    const slippagePercent = Math.min(50, Math.max(1, Math.floor(slippageBps / 100)));
    
    const requestBody: Record<string, unknown> = {
      publicKey: userPublicKey,
      action: action,
      mint: mint,
      priorityFee: 0.0005, // 0.0005 SOL priority fee
      slippage: slippagePercent,
      pool: pool // 'pump' for pump.fun, 'bonk' for bonk.fun, 'auto' to detect
    };
    
    if (action === 'buy') {
      // For buys, amount is in SOL - must be a number, not a string
      requestBody.denominatedInSol = "true";
      requestBody.amount = parseFloat(amount);
    } else {
      // For sells, use percentage string or token amount as number
      requestBody.denominatedInSol = "false";
      // If it's a percentage like "100%", keep as string; otherwise convert to number
      requestBody.amount = amount.includes('%') ? amount : parseFloat(amount);
    }
    
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

// Enhanced multi-DEX routing: Jupiter → Meteora fallback
async function tryJupiterSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps: number;
  userPublicKey: string;
  computeUnitPriceMicroLamports: number;
  asLegacy: boolean;
}): Promise<{ txs: string[]; source?: string } | { error: string }> {
  try {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps,
      userPublicKey,
      computeUnitPriceMicroLamports,
      asLegacy,
    } = params;

    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return { error: `Invalid swap amount for Jupiter: ${String(amount)}` };
    }

    // Use primary Jupiter API with authentication
    const jupiterHosts = [
      "https://api.jup.ag"
    ];
    const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";

    // Try the newer swap API first, then v6 (many examples still use v6).
    const apiVariants = [
      { name: "swap_v1", quotePath: "/swap/v1/quote", swapPath: "/swap/v1/swap" },
      { name: "v6", quotePath: "/v6/quote", swapPath: "/v6/swap" },
    ] as const;

    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "blackbox-farm/flipit-edge",
    };
    if (jupiterApiKey) {
      baseHeaders["x-api-key"] = jupiterApiKey;
    }

    let lastError = "";

    for (const host of jupiterHosts) {
      for (const variant of apiVariants) {
        try {
          console.log(`Trying Jupiter ${variant.name} via ${host}`);

          const qUrl = `${host}${variant.quotePath}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amt}&slippageBps=${slippageBps}&swapMode=ExactIn`;
          const qRes = await fetch(qUrl, { headers: baseHeaders });

          if (!qRes.ok) {
            const t = await qRes.text();
            lastError = `Jupiter quote failed (${variant.name}, ${host}): ${qRes.status} ${t}`;
            console.log(lastError);
            continue;
          }

          const qJson = await qRes.json();
          const quoteResponse = Array.isArray(qJson?.data)
            ? qJson.data[0]
            : (qJson?.data ?? qJson);

          if (!quoteResponse || (!quoteResponse.inAmount && !quoteResponse.routePlan)) {
            lastError = `Jupiter quote returned no routes (${variant.name}, ${host})`;
            console.log(lastError);
            continue;
          }

          const sRes = await fetch(`${host}${variant.swapPath}`, {
            method: "POST",
            headers: {
              ...baseHeaders,
              "Content-Type": "application/json",
            },
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
            lastError = `Jupiter swap build failed (${variant.name}, ${host}): ${sRes.status} ${t}`;
            console.log(lastError);
            continue;
          }

          const sJson = await sRes.json();
          const tx = sJson?.swapTransaction || sJson?.data?.swapTransaction;

          if (typeof tx !== "string") {
            lastError = `Jupiter swap build returned no transaction (${variant.name}, ${host})`;
            console.log(lastError);
            continue;
          }

          console.log(`Jupiter swap transaction built successfully (${variant.name}, ${host})`);
          return { txs: [tx], source: `jupiter-${variant.name}` };
        } catch (e) {
          lastError = `Jupiter error (${variant.name}, ${host}): ${(e as Error).message}`;
          console.log(lastError);
          continue;
        }
      }
    }

    return { error: `All Jupiter endpoints failed. Last error: ${lastError}` };
  } catch (e) {
    return { error: `Jupiter error: ${(e as Error).message}` };
  }
}

// Try Meteora aggregator API for DLMM pools (graduated tokens)
async function tryMeteoraSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps: number;
  userPublicKey: string;
}): Promise<{ tx: string; source: string } | { error: string }> {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey } = params;
    
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return { error: `Invalid swap amount for Meteora: ${String(amount)}` };
    }
    
    // Meteora DLMM API - find pool for pair
    const poolApiUrl = `https://dlmm-api.meteora.ag/pair/all_by_groups?page=0&limit=100`;
    console.log("Fetching Meteora pools for pair lookup...");
    
    // First, try to find a pool for this token pair
    const normalizedInput = inputMint.toLowerCase();
    const normalizedOutput = outputMint.toLowerCase();
    
    // Try the swap API endpoint
    const meteoraSwapUrl = "https://swap-api.meteora.ag/swap";
    
    const swapRequest = {
      inMint: inputMint,
      outMint: outputMint,
      amount: amt,
      slippageBps: slippageBps,
      userPublicKey: userPublicKey,
    };
    
    console.log("Trying Meteora swap API:", JSON.stringify(swapRequest));
    
    const swapRes = await fetch(meteoraSwapUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(swapRequest),
    });
    
    if (!swapRes.ok) {
      const errText = await swapRes.text();
      console.log(`Meteora swap API failed: ${swapRes.status} ${errText}`);
      return { error: `Meteora: ${swapRes.status} ${errText}` };
    }
    
    const swapJson = await swapRes.json();
    const tx = swapJson?.transaction || swapJson?.swapTransaction;
    
    if (typeof tx !== "string") {
      console.log("Meteora returned no transaction:", JSON.stringify(swapJson).slice(0, 200));
      return { error: "Meteora returned no transaction" };
    }
    
    console.log("Meteora swap transaction built successfully");
    return { tx, source: "meteora-dlmm" };
  } catch (e) {
    console.log("Meteora swap error:", (e as Error).message);
    return { error: `Meteora error: ${(e as Error).message}` };
  }
}

// Try Orca Whirlpool API
async function tryOrcaSwap(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps: number;
  userPublicKey: string;
}): Promise<{ tx: string; source: string } | { error: string }> {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey } = params;
    
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return { error: `Invalid swap amount for Orca: ${String(amount)}` };
    }
    
    // Orca Whirlpool API
    const orcaApiUrl = "https://api.orca.so/allPools";
    
    // For now, Orca is covered via Jupiter aggregation
    // This function serves as a placeholder for direct Orca integration if needed
    console.log("Orca direct swap not implemented, covered by Jupiter aggregation");
    return { error: "Orca direct swap not implemented - use Jupiter" };
  } catch (e) {
    return { error: `Orca error: ${(e as Error).message}` };
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
      priorityFeeSol, // New: priority fee in SOL (e.g., 0.0001, 0.0005)
      priorityFeeMode,
      action,
      preCreateWSOL,
      // Wallet ID for direct database lookup
      walletId,
    } = body;

    // Build list of RPC endpoints to try (with fallback)
    const rpcEndpoints: string[] = [];
    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    if (heliusApiKey) {
      rpcEndpoints.push(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`);
    }
    const customRpc = Deno.env.get("SOLANA_RPC_URL");
    if (customRpc) {
      rpcEndpoints.push(customRpc);
    }
    rpcEndpoints.push("https://api.mainnet-beta.solana.com");
    
    // Try each RPC until one works for initial connection test
    let rpcUrl = rpcEndpoints[0] || "https://api.mainnet-beta.solana.com";
    let connection = new Connection(rpcUrl, { commitment: "confirmed" });
    
    // Quick health check - if Helius is rate limited, fall back immediately
    try {
      const testSlot = await Promise.race([
        connection.getSlot(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
      ]);
      console.log(`Using RPC: ${rpcUrl.substring(0, 50)}..., slot: ${testSlot}`);
    } catch (e) {
      const errMsg = (e as Error).message || "";
      console.log(`Primary RPC failed (${errMsg}), trying fallbacks...`);
      
      for (let i = 1; i < rpcEndpoints.length; i++) {
        try {
          rpcUrl = rpcEndpoints[i];
          connection = new Connection(rpcUrl, { commitment: "confirmed" });
          const slot = await Promise.race([
            connection.getSlot(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
          ]);
          console.log(`Fallback RPC working: ${rpcUrl.substring(0, 50)}..., slot: ${slot}`);
          break;
        } catch {
          console.log(`Fallback RPC ${i} also failed`);
        }
      }
    }
    const bodyOwnerSecret = (body?.ownerSecret ? String(body.ownerSecret) : null);
    const headerSecret = req.headers.get("x-owner-secret");
    const envOwnerSecret = Deno.env.get("TRADER_PRIVATE_KEY") || null;

    // Prefer explicit secrets; fall back to env only if provided
    let secretToUse = bodyOwnerSecret || envOwnerSecret || "";
    // If walletId is provided, fetch the secret from the database
    if (walletId && !bodyOwnerSecret && !headerSecret) {
      try {
        const supabaseUrl = getEnv("SUPABASE_URL");
        const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

        const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Try super_admin_wallets first (for FlipIt), then blackbox_wallets, then airdrop_wallets
        const tables = ["super_admin_wallets", "blackbox_wallets", "airdrop_wallets"] as const;
        let walletSecret: string | null = null;

        for (const table of tables) {
          const { data, error } = await supabaseAdmin
            .from(table)
            .select("secret_key_encrypted")
            .eq("id", walletId)
            .maybeSingle();

          if (error) {
            console.log(`Wallet lookup error in ${table}:`, error.message);
            continue;
          }

          if (data?.secret_key_encrypted) {
            console.log(`Found wallet in ${table}`);
            walletSecret = data.secret_key_encrypted;
            break;
          }
        }

        if (!walletSecret) {
          return softError("WALLET_NOT_FOUND", `Wallet ${walletId} not found in any wallet table`);
        }

        // Decrypt the wallet secret
        secretToUse = await SecureStorage.decryptWalletSecret(walletSecret);
        console.log(`Decrypted wallet secret for ${walletId}`);
      } catch (error) {
        return softError(
          "WALLET_LOOKUP_FAILED",
          `Failed to fetch wallet: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (headerSecret) {
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
    if (secretToUse && secretToUse.includes("\n")) {
      try {
        // This looks like a base64 encoded secret, decode it
        const decoded = atob(secretToUse.replace(/\s/g, ""));
        secretToUse = decoded;
      } catch (error) {
        console.log("Base64 decode failed, trying as-is:", error);
      }
    }

    if (!secretToUse) {
      return softError(
        "MISSING_OWNER_SECRET",
        "No wallet secret provided. Pass x-owner-secret header, ownerSecret in body, or walletId."
      );
    }

    owner = parseKeypair(secretToUse);

    const confirmPolicy = String(_confirmPolicy ?? "processed").toLowerCase();
    const desiredCommitment = confirmPolicy === "processed" ? "processed" : "confirmed";

    // Update connection commitment if needed (connection already created with fallback logic above)
    if (desiredCommitment !== "confirmed") {
      connection = new Connection(rpcUrl, { commitment: desiredCommitment as any });
    }

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

    // Unwrap WSOL mode: close ALL WSOL token accounts (ATA + any temp accounts) and recover native SOL
    if (action === "unwrap-wsol") {
      try {
        console.log("Unwrapping WSOL for wallet:", owner.publicKey.toBase58());

        // IMPORTANT:
        // A user can have multiple WSOL token accounts (ATA + temporary WSOL accounts created during swaps).
        // Closing only the ATA can leave WSOL stranded. Here we close *all* token accounts for the WSOL mint.
        const tokenAccounts = await connection.getTokenAccountsByOwner(owner.publicKey, { mint: NATIVE_MINT });

        if (!tokenAccounts.value.length) {
          return ok({ unwrapped: false, message: "No WSOL accounts found", solRecovered: 0 });
        }

        const signatures: string[] = [];
        let recoveredLamportsTotal = 0;

        // Keep transactions small to avoid TX size limits
        const BATCH_SIZE = 8;
        for (let i = 0; i < tokenAccounts.value.length; i += BATCH_SIZE) {
          const batch = tokenAccounts.value.slice(i, i + BATCH_SIZE);

          const instrs = batch.map(({ pubkey }) =>
            new TransactionInstruction({
              programId: TOKEN_PROGRAM_ID,
              keys: [
                { pubkey, isSigner: false, isWritable: true },
                { pubkey: owner.publicKey, isSigner: false, isWritable: true }, // destination for all lamports
                { pubkey: owner.publicKey, isSigner: true, isWritable: false }, // authority
              ],
              data: new Uint8Array([9]), // CloseAccount instruction = 9 (Deno-safe)
            })
          );

          const tx = new Transaction().add(...instrs);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          tx.feePayer = owner.publicKey;
          tx.sign(owner);

          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
          await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed" as any);
          signatures.push(sig);

          // NOTE: The lamports recovered are the account lamports (rent + WSOL backing). Do NOT add token amount separately.
          recoveredLamportsTotal += batch.reduce((sum, a) => sum + (a.account?.lamports ?? 0), 0);
        }

        const solRecovered = recoveredLamportsTotal / 1e9;
        console.log(
          `WSOL unwrapped successfully! Recovered ${solRecovered} SOL from ${tokenAccounts.value.length} account(s). TXs: ${signatures.join(", ")}`
        );

        return ok({
          unwrapped: true,
          signature: signatures[0],
          signatures,
          solRecovered,
          message: `Recovered ${solRecovered.toFixed(6)} SOL from ${tokenAccounts.value.length} WSOL account(s)`,
        });
      } catch (e) {
        console.error("WSOL unwrap failed:", e);
        return bad(`WSOL unwrap failed: ${(e as Error).message}`, 500);
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
          // NEW: Prefer exact SOL input (lamports) from caller to avoid SOL↔USD double conversion.
          const explicitLamports = Number(body?.solAmountLamports ?? body?.solLamports ?? 0);
          const explicitSol = Number(body?.solAmountSol ?? body?.solAmount ?? 0);

          let wantedLamports: number;
          if (Number.isFinite(explicitLamports) && explicitLamports > 0) {
            wantedLamports = Math.floor(explicitLamports);
          } else if (Number.isFinite(explicitSol) && explicitSol > 0) {
            wantedLamports = Math.floor(explicitSol * 1_000_000_000);
          } else {
            // Legacy path: derive SOL from USD using a SOL/USD feed
            const usd = Number(usdcAmount ?? 0);
            if (!Number.isFinite(usd) || usd <= 0) return bad("Invalid usdcAmount for buy");
            const solPrice = await fetchSolUsdPrice();
            const approxPrice = solPrice > 0 ? solPrice : 200;
            wantedLamports = Math.floor((usd / approxPrice) * 1_000_000_000);
          }

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
        // CRITICAL FIX: ALL token sells go directly to SOL (not USDC)
        // This prevents leftover USDC in wallets and matches how TrojanBot works
        outputMint = NATIVE_MINT.toBase58();
        if (sellAll) {
          console.log("Sell debug:", {
            ownerPubkey: owner.publicKey.toBase58(),
            tokenMint
          });

          // Use Helius RPC for balance check - most reliable
          const balanceConnection = connection;

          // Try ATA-based balance first (getTokenBalance handles both token programs)
          let balanceResult = await getTokenBalance(balanceConnection, new PublicKey(tokenMint), owner.publicKey);

          // If ATA lookup failed, try full token account scan (more expensive but catches non-ATA accounts)
          if (!balanceResult || balanceResult.balance <= 0) {
            console.log("ATA balance check failed, trying full token account scan...");
            balanceResult = await scanTokenAccountsBalance(balanceConnection, new PublicKey(tokenMint), owner.publicKey);
          }

          if (!balanceResult || balanceResult.balance <= 0) {
            // Last resort: getTokenAccountsByOwner with mint filter
            console.log("Token account scan failed, trying getTokenAccountsByOwner with mint filter...");
            try {
              const tokenAccounts = await balanceConnection.getTokenAccountsByOwner(owner.publicKey, {
                mint: new PublicKey(tokenMint)
              });

              if (tokenAccounts.value.length > 0) {
                const accountInfo = tokenAccounts.value[0].account;
                const data = accountInfo.data as unknown as Uint8Array;
                if (data && data.length >= 72) {
                  // Parse balance from token account data (bytes 64-72 = amount, little-endian u64)
                  const tokenBalance = readU64LE(data.slice(64, 72));
                  if (tokenBalance > 0) {
                    console.log("Found balance via getTokenAccountsByOwner:", tokenBalance);
                    amount = Math.floor(tokenBalance);
                  } else {
                    return softError("NO_BALANCE", `Token balance is 0. Owner: ${owner.publicKey.toBase58().slice(0, 8)}...`);
                  }
                } else {
                  return softError("NO_BALANCE", `Token account data malformed. Owner: ${owner.publicKey.toBase58().slice(0, 8)}...`);
                }
              } else {
                console.log(`No token balance found for ${tokenMint} in wallet ${owner.publicKey.toBase58()}`);
                return softError(
                  "NO_BALANCE",
                  `No token balance found. Tokens may have already been sold or buy never completed. Token: ${tokenMint.slice(0, 8)}..., Wallet: ${owner.publicKey.toBase58().slice(0, 8)}...`
                );
              }
            } catch (altErr) {
              console.error("All balance check methods failed:", altErr);
              return softError(
                "BALANCE_CHECK_FAILED",
                `Balance check failed: ${(altErr as Error).message}. Token: ${tokenMint.slice(0, 8)}..., Wallet: ${owner.publicKey.toBase58().slice(0, 8)}...`
              );
            }
          } else {
            console.log("Found token balance:", balanceResult.balance, "using program:", balanceResult.programId.toBase58());
            amount = Math.floor(balanceResult.balance);
          }
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

    // Detect venue for tokenMint without assuming by suffix.
    // DexScreener is used as a fast hint so we don't waste fees submitting
    // PumpPortal txs for tokens that already have Raydium/Jupiter liquidity.
    // Now includes Meteora, Orca detection for smarter routing.
    async function getDexVenueHint(mintAddress: string): Promise<{
      dexIds: string[];
      hasRaydium: boolean;
      hasPumpFun: boolean;
      hasBonkFun: boolean;
      hasBagsFm: boolean;
      hasMeteora: boolean;
      hasOrca: boolean;
      hasJupiter: boolean;
      bestDex: string | null;
      highestLiquidity: number;
    } | null> {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
        if (!res.ok) return null;
        const json = await res.json();
        const pairs = Array.isArray(json?.pairs) ? json.pairs : [];

        const ids = pairs
          .map((p: any) => String(p?.dexId || "").toLowerCase())
          .filter(Boolean);
        const set = new Set(ids);
        
        // Check pair URLs for bags.fm detection
        const hasBagsFmUrl = pairs.some((p: any) => 
          String(p?.url || "").toLowerCase().includes("bags.fm")
        );
        
        // Find best DEX by liquidity
        let bestDex: string | null = null;
        let highestLiquidity = 0;
        for (const pair of pairs) {
          const liq = Number(pair?.liquidity?.usd || 0);
          if (liq > highestLiquidity) {
            highestLiquidity = liq;
            bestDex = String(pair?.dexId || "").toLowerCase();
          }
        }

        return {
          dexIds: Array.from(set),
          hasRaydium: set.has("raydium"),
          hasPumpFun: set.has("pumpfun") || set.has("pump"),
          hasBonkFun: set.has("bonkfun") || set.has("bonk"),
          hasBagsFm: set.has("bagsfm") || set.has("bags") || hasBagsFmUrl,
          hasMeteora: set.has("meteora") || set.has("meteora_dlmm") || set.has("meteoradlmm"),
          hasOrca: set.has("orca") || set.has("whirlpool"),
          hasJupiter: set.has("jupiter"),
          bestDex,
          highestLiquidity,
        };
      } catch (e) {
        console.log("DexScreener venue hint failed:", (e as Error)?.message?.slice(0, 120));
        return null;
      }
    }

    // Suffix heuristics as last resort only
    const isPumpFunToken = (mintAddress: string): boolean => {
      if (!mintAddress) return false;
      const lower = mintAddress.toLowerCase();
      return lower.endsWith("pump");
    };

    const isBonkFunToken = (mintAddress: string): boolean => {
      if (!mintAddress) return false;
      const lower = mintAddress.toLowerCase();
      return lower.endsWith("bonk");
    };

    const venueHint = tokenMint ? await getDexVenueHint(String(tokenMint)) : null;
    if (venueHint) {
      console.log("Dex venue hint:", { tokenMint, ...venueHint });
    }

    const suffixPump = tokenMint ? isPumpFunToken(String(tokenMint)) : false;
    const suffixBonk = tokenMint ? isBonkFunToken(String(tokenMint)) : false;

    const isRaydiumToken = Boolean(venueHint?.hasRaydium);
    const isMeteoraToken = Boolean(venueHint?.hasMeteora);
    const isOrcaToken = Boolean(venueHint?.hasOrca);
    const isPumpToken = Boolean(venueHint?.hasPumpFun) || suffixPump;
    const isBonkToken = Boolean(venueHint?.hasBonkFun) || suffixBonk;
    const isBagsToken = Boolean(venueHint?.hasBagsFm);

    // Bonding-curve tokens are only those WITHOUT AMM liquidity (Raydium/Meteora/Orca).
    const hasAmmLiquidity = isRaydiumToken || isMeteoraToken || isOrcaToken;
    const isBondingCurveToken = !hasAmmLiquidity && (isPumpToken || isBonkToken || isBagsToken);

    // Determine which pool to use for PumpPortal
    // bags.fm uses 'pump' pool via PumpPortal API
    const getBondingCurvePool = (): 'pump' | 'bonk' | 'auto' => {
      if (venueHint?.hasPumpFun) return 'pump';
      if (venueHint?.hasBonkFun) return 'bonk';
      if (venueHint?.hasBagsFm) return 'pump'; // bags.fm uses pump pool
      if (suffixPump) return 'pump';
      if (suffixBonk) return 'bonk';
      return 'auto';
    };
    
    // Determine routing priority based on detected DEXes
    // Priority: PumpPortal (bonding) → Best DEX by liquidity → Jupiter (aggregator) → Raydium → Meteora
    const getRoutingPriority = (): string[] => {
      const routes: string[] = [];
      
      if (isBondingCurveToken) {
        routes.push('pumpportal');
      }
      
      // Add best DEX first if it has significant liquidity
      if (venueHint?.bestDex && venueHint.highestLiquidity > 1000) {
        if (venueHint.bestDex === 'raydium' && !routes.includes('raydium')) routes.push('raydium');
        if (venueHint.bestDex.includes('meteora') && !routes.includes('meteora')) routes.push('meteora');
        if (venueHint.bestDex === 'orca' && !routes.includes('jupiter')) routes.push('jupiter'); // Orca via Jupiter
      }
      
      // Jupiter aggregator covers most DEXes including Orca
      if (!routes.includes('jupiter')) routes.push('jupiter');
      
      // Raydium direct
      if (!routes.includes('raydium')) routes.push('raydium');
      
      // Meteora direct fallback
      if (!routes.includes('meteora')) routes.push('meteora');
      
      return routes;
    };

    const routingPriority = getRoutingPriority();

    // Log routing decision with full venue info
    console.log(
      `Routing decision: token=${tokenMint}, routes=[${routingPriority.join(' → ')}], ` +
      `raydium=${isRaydiumToken}, meteora=${isMeteoraToken}, orca=${isOrcaToken}, ` +
      `pump=${isPumpToken}, bonk=${isBonkToken}, bags=${isBagsToken}, side=${side}, ` +
      `bestDex=${venueHint?.bestDex || 'unknown'}, liq=$${venueHint?.highestLiquidity?.toFixed(0) || 0}`
    );

    // Get ATAs when not SOL
    let isInputSol = isSolMint(String(inputMint));
    let isOutputSol = isSolMint(String(outputMint));

    let inputAccount = isInputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(inputMint), owner.publicKey)).toBase58();
    let outputAccount = isOutputSol ? undefined : (await getAssociatedTokenAddress(new PublicKey(outputMint), owner.publicKey)).toBase58();

    // For bonding curve tokens (pump.fun/bonk.fun/bags.fm), try PumpPortal FIRST
    // These tokens typically don't have Raydium/Jupiter liquidity until graduation
    if (isBondingCurveToken && tokenMint && side) {
      const platform = isBagsToken ? "bags.fm" : (isBonkToken ? "bonk.fun" : "pump.fun");
      console.log(`Bonding curve token detected (${platform}), trying PumpPortal first...`);

      let pumpAmount: string;
      if (side === "buy") {
        const solAmount = Number(amount) / 1_000_000_000;
        pumpAmount = solAmount.toString();
      } else {
        pumpAmount = sellAll ? "100%" : String(amount);
      }

      // Use the USER slippage for bonding curve tokens.
      // CRITICAL: do NOT auto-increase slippage to 10-50% (that can cause massive overpay fills).
      const basePumpSlippage = Math.max(1, Number(slippageBps));
      const slippageCandidates = [basePumpSlippage]
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));

      console.log(
        `PumpPortal slippage candidates (bps): ${slippageCandidates.join(", ")}`
      );

      let lastPumpError: string | null = null;
      let sawSlippageError = false;

      try {
        // First try with specific pool, then with 'auto' if it fails
        const poolsRaw: Array<'pump' | 'bonk' | 'auto'> = [getBondingCurvePool(), 'auto'];
        const pools = Array.from(new Set(poolsRaw));

        pump_attempts:
        for (const candidateSlippageBps of slippageCandidates) {
          console.log(`PumpPortal attempt with ${candidateSlippageBps} bps slippage`);

          for (const pool of pools) {
            const pumpResult = await tryPumpPortalTrade({
              mint: String(tokenMint),
              userPublicKey: owner.publicKey.toBase58(),
              action: side as 'buy' | 'sell',
              amount: pumpAmount,
              slippageBps: candidateSlippageBps,
              pool,
            });

            if ("tx" in pumpResult) {
              const vtx = VersionedTransaction.deserialize(pumpResult.tx);

              const HELIUS_API_KEY = Deno.env.get("HELIUS_API_KEY");
              const txRpc = HELIUS_API_KEY
                ? new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, { commitment: "confirmed" })
                : connection;

              const { blockhash, lastValidBlockHeight } = await txRpc.getLatestBlockhash("confirmed");
              (vtx as any).message.recentBlockhash = blockhash;
              vtx.sign([owner]);

              let sig: string;
              try {
                // Use preflight so we can fail fast without paying fees for doomed txs.
                sig = await txRpc.sendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
              } catch (sendErr) {
                const msg = (sendErr as Error)?.message || String(sendErr);
                lastPumpError = `PumpPortal send failed (pool=${pool}, slippage=${candidateSlippageBps}): ${msg}`;
                console.error(lastPumpError);
                continue;
              }

              // CRITICAL: Use hardConfirmTransaction for reliable confirmation
              const confirmResult = await hardConfirmTransaction(txRpc, sig, blockhash, lastValidBlockHeight, 30000);

              if (!confirmResult.confirmed) {
                const txError = confirmResult.error || "Unknown confirmation failure";
                lastPumpError = `PumpPortal tx failed (pool=${pool}, slippage=${candidateSlippageBps}): ${txError}`;
                console.error(lastPumpError);

                const isCustom1 = txError.includes('"Custom":1');
                if (isCustom1) {
                  // Treat Custom:1 as slippage/price-move for bonding curve tokens; retry with higher slippage.
                  sawSlippageError = true;
                  continue;
                }

                // 6005 is a common PumpPortal on-chain failure code (often seen after migration)
                if (txError.includes("6005") || txError.includes("TX_FAILED_ON_CHAIN")) {
                  console.log("PumpPortal tx failed, switching to DEX routing (Raydium/Jupiter)...");
                  needJupiter = true;
                  jupReason = `PumpPortal tx failed: ${txError}`;
                  break pump_attempts;
                }

                if (txError.includes("TX_EXPIRED") || txError.includes("TX_NOT_CONFIRMED")) {
                  console.log("PumpPortal tx dropped/expired, switching to DEX routing...");
                  needJupiter = true;
                  jupReason = txError;
                  break pump_attempts;
                }

                // Unknown failure → fallback
                needJupiter = true;
                jupReason = `PumpPortal tx failed: ${txError}`;
                break pump_attempts;
              }

              console.log(`PumpPortal ${side} successful with pool=${pool} slippage=${candidateSlippageBps}:`, sig);
              // For PumpPortal, we don't have expected outAmount - caller should verify on-chain
              return ok({ signatures: [sig], source: "pumpportal", pool, outAmount: null, slippageBps: candidateSlippageBps });
            } else {
              lastPumpError = `PumpPortal build failed (pool=${pool}, slippage=${candidateSlippageBps}): ${pumpResult.error}`;
              console.log(lastPumpError);
            }
          }
        }

        // If we got here and didn't explicitly switch to Jupiter, then PumpPortal couldn't complete.
        if (!needJupiter) {
          needJupiter = true;
          jupReason = sawSlippageError
            ? `PumpPortal could not execute even after slippage retries (last: ${lastPumpError ?? "unknown"})`
            : `PumpPortal failed (last: ${lastPumpError ?? "unknown"})`;
        }
      } catch (pumpError) {
        console.log(`PumpPortal error for bonding curve token, falling back: ${(pumpError as Error).message}`);
        needJupiter = true;
        jupReason = `PumpPortal error: ${(pumpError as Error).message}`;
      }
    }

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

    // Priority fee (allow override or use priorityFeeMode)
    // Priority: priorityFeeSol (SOL amount) > _feeOverride/_altFeeOverride (microLamports) > priorityFeeMode > dynamic
    let computeUnitPriceMicroLamports = 0;
    
    // NEW: If priorityFeeSol is provided, convert SOL to microLamports
    // Formula: SOL * 1e9 (to lamports) / 200_000 (compute units) * 1e6 (to microLamports)
    // Simplified: SOL * 5e12 (gives microLamports per compute unit)
    // Actually, priority fee is: computeUnitPrice * computeUnits / 1e6 = total lamports
    // So for 0.0001 SOL = 100,000 lamports = computeUnitPrice * 200,000 / 1e6
    // computeUnitPrice = 100,000 * 1e6 / 200,000 = 500,000 microLamports? That's too high.
    // Let me recalculate: The fee modes show low: 10,000 = ~0.0001 SOL
    // So 0.0001 SOL ≈ 10,000 microLamports, meaning: SOL * 1e8 = microLamports
    if (typeof priorityFeeSol === 'number' && priorityFeeSol > 0) {
      // Convert SOL to approximate microLamports (based on existing mode mappings)
      // 0.0001 SOL = 10,000 µLamports, 0.0005 SOL = 50,000 µLamports
      // Ratio: 1 SOL = 100,000,000 µLamports (1e8)
      computeUnitPriceMicroLamports = Math.round(priorityFeeSol * 1e8);
      console.log(`Using custom priority fee: ${priorityFeeSol} SOL = ${computeUnitPriceMicroLamports} µLamports`);
    } else {
      computeUnitPriceMicroLamports = Number(_feeOverride ?? _altFeeOverride ?? 0);
    }
    
    if (!Number.isFinite(computeUnitPriceMicroLamports) || computeUnitPriceMicroLamports <= 0) {
      // Map priorityFeeMode to microLamports (1 SOL = 1e9 lamports, 1 lamport = 1e6 microLamports)
      // low: ~0.0001 SOL, medium: ~0.0005 SOL, high: ~0.001 SOL, turbo: ~0.0075 SOL, ultra: ~0.009 SOL
      const feeModes: Record<string, number> = {
        low: 10_000,      // ~0.0001 SOL
        medium: 50_000,   // ~0.0005 SOL
        high: 100_000,    // ~0.001 SOL
        turbo: 750_000,   // ~0.0075 SOL
        ultra: 900_000,   // ~0.009 SOL
      };
      if (priorityFeeMode && feeModes[priorityFeeMode]) {
        computeUnitPriceMicroLamports = feeModes[priorityFeeMode];
      } else {
        computeUnitPriceMicroLamports = await getPriorityFeeMicroLamports(connection);
      }
    }
    // Clamp to 5k–2M µLamports to control cost and allow high fees (raised max for 0.002 SOL = 200,000)
    computeUnitPriceMicroLamports = Math.min(Math.max(computeUnitPriceMicroLamports, 5_000), 2_000_000);

    // Jupiter fallback if Raydium compute failed at compute stage
    if (needJupiter) {
      // For pump.fun tokens, use higher slippage (10% minimum) due to volatility
      const isPumpToken = tokenMint?.endsWith?.('pump') || String(outputMint).endsWith('pump') || String(inputMint).endsWith('pump');
      const baseSlippage = Number(slippageBps);
      const effectiveSlippage = isPumpToken ? Math.max(baseSlippage, 1000) : baseSlippage; // 10% min for pump tokens
      const maxRetrySlippage = isPumpToken ? 5000 : 2500; // up to 50% for pump tokens
      
      console.log(`Jupiter fallback with slippage: ${effectiveSlippage} bps (pump token: ${isPumpToken})`);
      const j = await tryJupiterSwap({
        inputMint: String(inputMint),
        outputMint: String(outputMint),
        amount: amount as any,
        slippageBps: effectiveSlippage,
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
            // Refresh blockhash BEFORE signing
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            if (!tx.feePayer) tx.feePayer = owner.publicKey;
            tx.sign(owner);
            let sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
            
            // ALWAYS use hard confirmation for reliability
            const confirmResult = await hardConfirmTransaction(connection, sig, blockhash, lastValidBlockHeight, 30000);
            
            if (!confirmResult.confirmed) {
              // Check if it's slippage error - retry with higher slippage
              const isSlippageError = confirmResult.error?.includes('"Custom":1') || confirmResult.error?.includes('SlippageToleranceExceeded');
              const retrySlippage = isSlippageError ? Math.min(effectiveSlippage * 2, 2500) : effectiveSlippage; // Double slippage, max 25%
              
              console.log(`Jupiter Legacy tx failed (${confirmResult.error}), retrying with ${retrySlippage} bps slippage...`);
              
              // Re-fetch quote with higher slippage if needed
              if (isSlippageError && retrySlippage > effectiveSlippage) {
                const retryJ = await tryJupiterSwap({
                  inputMint: String(inputMint),
                  outputMint: String(outputMint),
                  amount: amount as any,
                  slippageBps: retrySlippage,
                  userPublicKey: owner.publicKey.toBase58(),
                  computeUnitPriceMicroLamports,
                  asLegacy: true,
                });
                
                if ("txs" in retryJ && retryJ.txs.length > 0) {
                  const retryU8 = b64ToU8(retryJ.txs[0]);
                  const retryTx = Transaction.from(retryU8 as any);
                  const fresh = await connection.getLatestBlockhash("confirmed");
                  retryTx.recentBlockhash = fresh.blockhash;
                  if (!retryTx.feePayer) retryTx.feePayer = owner.publicKey;
                  retryTx.sign(owner);
                  sig = await connection.sendRawTransaction(retryTx.serialize(), { skipPreflight: true, maxRetries: 2 });
                  
                  const retryResult = await hardConfirmTransaction(connection, sig, fresh.blockhash, fresh.lastValidBlockHeight, 30000);
                  if (!retryResult.confirmed) {
                    return softError("SWAP_FAILED", `Jupiter swap failed after slippage retry: ${retryResult.error}`);
                  }
                } else {
                  return softError("SWAP_FAILED", `Jupiter swap failed after retry: ${confirmResult.error}`);
                }
              } else {
                const fresh = await connection.getLatestBlockhash("confirmed");
                tx.recentBlockhash = fresh.blockhash;
                tx.sign(owner);
                sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
                
                const retryResult = await hardConfirmTransaction(connection, sig, fresh.blockhash, fresh.lastValidBlockHeight, 30000);
                if (!retryResult.confirmed) {
                  return softError("SWAP_FAILED", `Jupiter swap failed after retry: ${retryResult.error}`);
                }
              }
            }
            
            sigs.push(sig);
          }
        } else {
          for (const b64 of j.txs) {
            const u8 = b64ToU8(b64);
            const vtx = VersionedTransaction.deserialize(u8);
            // Refresh blockhash BEFORE signing
            const fresh = await connection.getLatestBlockhash("confirmed");
            // @ts-ignore - message is mutable in this context
            (vtx as any).message.recentBlockhash = fresh.blockhash;
            vtx.sign([owner]);
            let sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
            
            // ALWAYS use hard confirmation for reliability
            const confirmResult = await hardConfirmTransaction(connection, sig, fresh.blockhash, fresh.lastValidBlockHeight, 30000);
            
            if (!confirmResult.confirmed) {
              // Check if it's slippage error - retry with higher slippage
              const isSlippageError = confirmResult.error?.includes('"Custom":1') || confirmResult.error?.includes('SlippageToleranceExceeded');
              const retrySlippage = isSlippageError ? Math.min(effectiveSlippage * 2, 2500) : effectiveSlippage; // Double slippage, max 25%
              
              console.log(`Jupiter V0 tx failed (${confirmResult.error}), retrying with ${retrySlippage} bps slippage...`);
              
              // Re-fetch quote with higher slippage if needed
              if (isSlippageError && retrySlippage > effectiveSlippage) {
                const retryJ = await tryJupiterSwap({
                  inputMint: String(inputMint),
                  outputMint: String(outputMint),
                  amount: amount as any,
                  slippageBps: retrySlippage,
                  userPublicKey: owner.publicKey.toBase58(),
                  computeUnitPriceMicroLamports,
                  asLegacy: false,
                });
                
                if ("txs" in retryJ && retryJ.txs.length > 0) {
                  const retryU8 = b64ToU8(retryJ.txs[0]);
                  const retryVtx = VersionedTransaction.deserialize(retryU8);
                  const newer = await connection.getLatestBlockhash("confirmed");
                  (retryVtx as any).message.recentBlockhash = newer.blockhash;
                  retryVtx.sign([owner]);
                  sig = await connection.sendTransaction(retryVtx, { skipPreflight: true, maxRetries: 2 });
                  
                  const retryResult = await hardConfirmTransaction(connection, sig, newer.blockhash, newer.lastValidBlockHeight, 30000);
                  if (!retryResult.confirmed) {
                    return softError("SWAP_FAILED", `Jupiter swap failed after slippage retry: ${retryResult.error}`);
                  }
                } else {
                  return softError("SWAP_FAILED", `Jupiter swap failed after retry: ${confirmResult.error}`);
                }
              } else {
                const newer = await connection.getLatestBlockhash("confirmed");
                (vtx as any).message.recentBlockhash = newer.blockhash;
                vtx.sign([owner]);
                sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
                
                const retryResult = await hardConfirmTransaction(connection, sig, newer.blockhash, newer.lastValidBlockHeight, 30000);
                if (!retryResult.confirmed) {
                  return softError("SWAP_FAILED", `Jupiter swap failed after retry: ${retryResult.error}`);
                }
              }
            }
            
            sigs.push(sig);
          }
        }
        // Jupiter fallback - no outAmount available, caller should verify on-chain
        const solInputLamports =
          side === "buy" && String(inputMint) === NATIVE_MINT.toBase58() && Number.isFinite(Number(amount))
            ? Number(amount)
            : null;
        return ok({ signatures: sigs, source: "jupiter", outAmount: null, solInputLamports });
      } else {
        // Jupiter also failed - try Meteora direct API for DLMM pools (graduated tokens)
        console.log(`Jupiter failed (${j.error}), trying Meteora direct API...`);
        
        const meteoraResult = await tryMeteoraSwap({
          inputMint: String(inputMint),
          outputMint: String(outputMint),
          amount: amount as any,
          slippageBps: Number(slippageBps),
          userPublicKey: owner.publicKey.toBase58(),
        });
        
        if ("tx" in meteoraResult) {
          try {
            const u8 = b64ToU8(meteoraResult.tx);
            const vtx = VersionedTransaction.deserialize(u8);
            
            const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY');
            const txRpc = HELIUS_API_KEY 
              ? new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, { commitment: "confirmed" })
              : connection;
            
            const { blockhash, lastValidBlockHeight } = await txRpc.getLatestBlockhash("confirmed");
            (vtx as any).message.recentBlockhash = blockhash;
            vtx.sign([owner]);
            
            const sig = await txRpc.sendTransaction(vtx, { skipPreflight: true, maxRetries: 3 });
            const confirmResult = await hardConfirmTransaction(txRpc, sig, blockhash, lastValidBlockHeight, 30000);
            
            if (confirmResult.confirmed) {
              console.log(`Meteora ${side} successful:`, sig);
              const solInputLamports =
                side === "buy" && String(inputMint) === NATIVE_MINT.toBase58() && Number.isFinite(Number(amount))
                  ? Number(amount)
                  : null;
              return ok({ signatures: [sig], source: meteoraResult.source, outAmount: null, solInputLamports });
            } else {
              console.log(`Meteora tx failed: ${confirmResult.error}`);
            }
          } catch (meteoraSendErr) {
            console.log(`Meteora send error: ${(meteoraSendErr as Error).message}`);
          }
        } else {
          console.log(`Meteora API failed: ${meteoraResult.error}`);
        }
        
        // Meteora also failed - try PumpPortal as LAST RESORT for ANY token
        // PumpPortal will quickly fail if the token is not on pump.fun bonding curve
        console.log(`All DEX APIs failed, trying PumpPortal as last resort for any bonding curve token (${side})...`);
        
        // Calculate the SOL amount for buys from lamports
        let pumpAmount: string;
        if (side === "buy") {
          // amount is in lamports, convert to SOL for PumpPortal
          const solAmount = Number(amount) / 1_000_000_000;
          pumpAmount = solAmount.toString();
        } else {
          // For sells, use 100% or the token amount
          pumpAmount = sellAll ? "100%" : String(amount);
        }
        
        try {
          const pumpResult = await tryPumpPortalTrade({
            mint: String(tokenMint),
            userPublicKey: owner.publicKey.toBase58(),
            action: side as 'buy' | 'sell',
            amount: pumpAmount,
            slippageBps: Number(slippageBps),
            pool: getBondingCurvePool(),
          });
          
          if ("tx" in pumpResult) {
            try {
              const vtx = VersionedTransaction.deserialize(pumpResult.tx);
              vtx.sign([owner]);
              
              // Use Helius RPC for better transaction submission
              const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY');
              const txRpc = HELIUS_API_KEY 
                ? new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, { commitment: "confirmed" })
                : new Connection("https://api.mainnet-beta.solana.com", { commitment: "confirmed" });
              
              const { blockhash, lastValidBlockHeight } = await txRpc.getLatestBlockhash("confirmed");
              
              // Update blockhash before sending
              (vtx as any).message.recentBlockhash = blockhash;
              vtx.sign([owner]); // Re-sign with new blockhash
              
              const sig = await txRpc.sendTransaction(vtx, { skipPreflight: true, maxRetries: 3 });
              
              // CRITICAL: Use hardConfirmTransaction for reliable confirmation
              const confirmResult = await hardConfirmTransaction(txRpc, sig, blockhash, lastValidBlockHeight, 30000);
              
              if (!confirmResult.confirmed) {
                console.error("PumpPortal fallback tx failed:", confirmResult.error);
                return softError(
                  "SWAP_FAILED",
                  `All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; Meteora: ${meteoraResult.error || 'tx failed'}; PumpPortal: ${confirmResult.error}`
                );
              }
              
              console.log(`PumpPortal ${side} successful:`, sig);
              const solInputLamports =
                side === "buy" && String(inputMint) === NATIVE_MINT.toBase58() && Number.isFinite(Number(amount))
                  ? Number(amount)
                  : null;
              return ok({ signatures: [sig], source: "pumpportal", outAmount: null, solInputLamports });
            } catch (sendError) {
              console.error("PumpPortal transaction send failed:", (sendError as Error).message);
              return softError(
                "SWAP_FAILED",
                `All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; Meteora: ${meteoraResult.error || 'n/a'}; PumpPortal send: ${(sendError as Error).message}`
              );
            }
          } else {
            // PumpPortal returned an error - token probably not on pump.fun bonding curve
            console.log("PumpPortal also failed:", pumpResult.error);
            return softError(
              "SWAP_FAILED",
              `All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; Meteora: ${meteoraResult.error || 'n/a'}; PumpPortal: ${pumpResult.error}`
            );
          }
        } catch (pumpError) {
          console.error("PumpPortal attempt failed:", (pumpError as Error).message);
          return softError(
            "SWAP_FAILED",
            `All swap methods failed. Raydium: ${jupReason}; Jupiter: ${j.error}; Meteora: ${meteoraResult.error || 'n/a'}; PumpPortal error: ${(pumpError as Error).message}`
          );
        }
      }
    }

    // Build transactions (first try)
    let signVersion = txVersion as string;
    let lastBuilderErrorMessage: string | undefined;
    const txRes = await fetch(`${SWAP_HOST}/transaction/swap-base-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        computeUnitPriceMicroLamports: String(computeUnitPriceMicroLamports),
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
      return softError("RAYDIUM_BUILD_FAILED", `Raydium transaction build failed: ${txRes.status} ${t}`);
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
                computeUnitPriceMicroLamports: String(computeUnitPriceMicroLamports),
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
          return softError(
            "SWAP_FAILED",
            `No transactions returned from Raydium${lastBuilderErrorMessage ? `: ${lastBuilderErrorMessage}` : ""}; Jupiter fallback: ${j.error}`
          );
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
        
        // ALWAYS use hard confirmation (ignore confirmPolicy for reliability)
        const confirmResult = await hardConfirmTransaction(connection, sig, fresh.blockhash, fresh.lastValidBlockHeight, 30000);
        
        if (!confirmResult.confirmed) {
          // Retry once with fresh blockhash
          console.log(`V0 tx failed (${confirmResult.error}), retrying with fresh blockhash...`);
          const newer = await connection.getLatestBlockhash("confirmed");
          (vtx as any).message.recentBlockhash = newer.blockhash;
          vtx.sign([owner]);
          sig = await connection.sendTransaction(vtx, { skipPreflight: true, maxRetries: 2 });
          
          const retryResult = await hardConfirmTransaction(connection, sig, newer.blockhash, newer.lastValidBlockHeight, 30000);
          if (!retryResult.confirmed) {
            return softError("SWAP_FAILED", `Raydium swap failed after retry: ${retryResult.error}`);
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
        
        // ALWAYS use hard confirmation (ignore confirmPolicy for reliability)
        const confirmResult = await hardConfirmTransaction(connection, sig, fresh.blockhash, fresh.lastValidBlockHeight, 30000);
        
        if (!confirmResult.confirmed) {
          // Retry once with fresh blockhash
          console.log(`Legacy tx failed (${confirmResult.error}), retrying with fresh blockhash...`);
          const newer = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = newer.blockhash;
          tx.sign(owner);
          sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
          
          const retryResult = await hardConfirmTransaction(connection, sig, newer.blockhash, newer.lastValidBlockHeight, 30000);
          if (!retryResult.confirmed) {
            return softError("SWAP_FAILED", `Raydium swap failed after retry: ${retryResult.error}`);
          }
        }
        
        sigs.push(sig);
      }
    }

    // Extract expected output amount from Raydium compute response
    const expectedOutAmount = swapResponse?.data?.outputAmount || swapResponse?.outputAmount || null;
    console.log("Raydium swap complete, expected outAmount:", expectedOutAmount);
    
    const solInputLamports =
      side === "buy" && String(inputMint) === NATIVE_MINT.toBase58() && Number.isFinite(Number(amount))
        ? Number(amount)
        : null;

    return ok({ signatures: sigs, source: "raydium", outAmount: expectedOutAmount, solInputLamports });
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
