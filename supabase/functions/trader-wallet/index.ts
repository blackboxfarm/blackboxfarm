import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, Keypair, PublicKey } from "npm:@solana/web3.js@1.95.3";
import { SecureStorage } from '../_shared/encryption.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import bs58 from "npm:bs58@5.0.0";

// Lightweight ATA helper
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgramId: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return addr;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-token, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

function parseKeypair(secret: string): Keypair {
  try {
    const s = secret.trim();
    if (s.startsWith("[")) {
      const arr = JSON.parse(s) as number[];
      const u8 = new Uint8Array(arr);
      if (u8.length === 64) return Keypair.fromSecretKey(u8);
      if (u8.length === 32) return Keypair.fromSeed(u8);
      throw new Error(`bad secret key size: ${u8.length}`);
    }
    const decoded = bs58.decode(s);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
    throw new Error(`bad secret key size: ${decoded.length}`);
  } catch (e) {
    throw new Error(`Failed to parse TRADER_PRIVATE_KEY: ${(e as Error).message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Setup debug logging
    const isPost = req.method === "POST";
    const url = new URL(req.url);
    let body: any = {};
    if (isPost) {
      try { body = await req.json(); } catch { body = {}; }
    }
    const debug = (url.searchParams.get("debug") === "true") || Boolean(body?.debug);
    const logs: string[] = [];
    const slog = (msg: string) => {
      const line = `${new Date().toISOString()} ${msg}`;
      logs.push(line);
      console.log(`[trader-wallet] ${msg}`);
    };

    slog(`Request start: method=${req.method}`);

    // Optional token guard - relaxed to avoid blocking Supabase client or public calls
    const fnToken = Deno.env.get("FUNCTION_TOKEN");
    const isSupabaseClient = Boolean(req.headers.get("x-client-info"));
    if (fnToken) {
      const headerToken = req.headers.get("x-function-token") || (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
      if (headerToken === fnToken) {
        slog("Function token validated");
      } else if (isSupabaseClient) {
        slog("Supabase client detected; allowing without function token");
      } else {
        slog("No function token provided; proceeding (verify_jwt=false)");
      }
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL") || "https://mainnet.helius-rpc.com/?api-key=4237f40d-5c4c-4c30-9f85-7fc0026e1094";
    const headerSecret = req.headers.get("x-owner-secret");
    const envSecret = Deno.env.get("TRADER_PRIVATE_KEY");
    
    if (!headerSecret && !envSecret) {
      slog("Missing both x-owner-secret and TRADER_PRIVATE_KEY");
      return ok({ error: "Missing secret: TRADER_PRIVATE_KEY or x-owner-secret", ...(debug ? { debugLogs: logs } : {}) }, 500);
    }

    // Decrypt if it's from header (encrypted from database)
    let secretToUse = envSecret!;
    if (headerSecret) {
      try {
        slog("Decrypting owner secret via encrypt-data function");
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );
        const { data, error } = await supabaseClient.functions.invoke('encrypt-data', {
          body: { data: headerSecret, action: 'decrypt' }
        });
        if (error) throw error;
        const decrypted = (data as any)?.decryptedData ?? '';
        if (!decrypted) throw new Error('Empty decrypted result');
        secretToUse = decrypted;
        slog("✅ Decryption successful via encrypt-data (length: " + secretToUse.length + ")");
      } catch (invokeErr) {
        slog("⚠️ encrypt-data decrypt failed: " + (invokeErr as Error)?.message);
        try {
          // Handle AES: prefix produced by encrypt-data directly with local AES helper
          if (headerSecret.startsWith('AES:')) {
            const payload = headerSecret.substring(4);
            secretToUse = await SecureStorage.decrypt(payload);
            slog("✅ Local AES decryption successful (length: " + secretToUse.length + ")");
          } else {
            // Legacy base64 or plaintext formats
            slog("🔄 Trying base64 decode for legacy format");
            const decoded = atob(headerSecret);
            // decoded may be either base58 string or JSON array string
            try { parseKeypair(decoded); secretToUse = decoded; }
            catch {
              // If decoded is raw bytes of keypair, convert to Uint8Array and validate
              const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
              if (bytes.length === 64 || bytes.length === 32) {
                try { Keypair.fromSecretKey(bytes); secretToUse = JSON.stringify(Array.from(bytes)); }
                catch (e) { throw e; }
              } else {
                throw new Error('Unsupported decoded secret format');
              }
            }
            slog("✅ Base64 path produced a valid secret");
          }
        } catch (fallbackErr) {
          slog("❌ All decryption paths failed: " + (fallbackErr as Error)?.message);
          // As a last resort, attempt raw parse (will throw if invalid)
          try {
            parseKeypair(headerSecret);
            secretToUse = headerSecret;
          } catch (parseError) {
            return ok({ error: `Invalid wallet secret format. Please check wallet configuration.` , ...(debug ? { debugLogs: logs } : {}) }, 400);
          }
        }
      }
    } else {
      slog("Using TRADER_PRIVATE_KEY from env");
    }

    const kp = parseKeypair(secretToUse);
    const pub = kp.publicKey;
    slog("Parsed keypair. publicKey=" + pub.toBase58());
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });
    slog("Connecting to RPC: " + rpcUrl);
    const lamports = await connection.getBalance(pub).catch((e) => {
      slog("getBalance failed: " + (e as Error)?.message);
      return 0;
    });
    slog(`SOL balance (lamports): ${lamports}`);

// Optional token balance query (supports GET or POST)
const tokenMint = url.searchParams.get("tokenMint") ?? (body?.tokenMint ?? null);
const getAllTokens = (url.searchParams.get("getAllTokens") === "true") || Boolean(body?.getAllTokens);
slog(`Params: tokenMint=${tokenMint ?? 'none'} getAllTokens=${getAllTokens}`);
    
    let tokenInfo: Record<string, unknown> = {};
    if (tokenMint) {
      try {
        const mintPk = new PublicKey(tokenMint);
        const ataClassic = getAssociatedTokenAddress(mintPk, pub, TOKEN_PROGRAM_ID);
        const ata2022 = getAssociatedTokenAddress(mintPk, pub, TOKEN_2022_PROGRAM_ID);
        slog(`Derived ATA (classic)=${ataClassic.toBase58()} (2022)=${ata2022.toBase58()}`);

        let chosen: { account: PublicKey; program: 'classic' | 'token-2022'; bal: Awaited<ReturnType<typeof connection.getTokenAccountBalance>> | null } | null = null;
        // Try classic first
        const balClassic = await connection.getTokenAccountBalance(ataClassic).catch((e) => { slog(`Classic ATA balance fetch error: ${(e as Error)?.message}`); return null; });
        if (balClassic?.value) {
          chosen = { account: ataClassic, program: 'classic', bal: balClassic };
          slog(`Found classic balance: raw=${balClassic.value.amount} decimals=${balClassic.value.decimals}`);
        }
        // Try 2022 if nothing found
        if (!chosen) {
          const bal22 = await connection.getTokenAccountBalance(ata2022).catch((e) => { slog(`2022 ATA balance fetch error: ${(e as Error)?.message}`); return null; });
          if (bal22?.value) {
            chosen = { account: ata2022, program: 'token-2022', bal: bal22 };
            slog(`Found token-2022 balance: raw=${bal22.value.amount} decimals=${bal22.value.decimals}`);
          }
        }

        if (chosen?.bal?.value) {
          tokenInfo = {
            tokenMint,
            tokenProgram: chosen.program,
            tokenAccount: chosen.account.toBase58(),
            tokenBalanceRaw: chosen.bal.value.amount,
            tokenDecimals: chosen.bal.value.decimals,
            tokenUiAmount: Number(chosen.bal.value.uiAmountString ?? chosen.bal.value.uiAmount ?? 0),
          };
        } else {
          tokenInfo = { tokenMint, tokenAccount: ataClassic.toBase58(), tokenBalanceRaw: "0", tokenDecimals: 0, tokenUiAmount: 0 };
          slog("No balance found for provided tokenMint on either program");
        }
      } catch (err) {
        const msg = String((err as Error)?.message || err);
        slog("tokenMint processing error: " + msg);
        tokenInfo = { tokenMint, tokenError: msg };
      }
    }

    // Get all tokens if requested
    let allTokens: any[] = [];
    if (getAllTokens) {
      try {
        slog("Fetching token accounts (classic)");
        const classicAccounts = await connection.getTokenAccountsByOwner(pub, {
          programId: TOKEN_PROGRAM_ID
        });
        slog(`Found ${classicAccounts.value.length} classic token accounts`);

        slog("Fetching token accounts (token-2022)");
        const v22Accounts = await connection.getTokenAccountsByOwner(pub, {
          programId: TOKEN_2022_PROGRAM_ID
        });
        slog(`Found ${v22Accounts.value.length} token-2022 accounts`);
        
        const processAccount = async (acc: typeof classicAccounts.value[number], program: 'classic' | 'token-2022') => {
          try {
            const accountInfo = await connection.getTokenAccountBalance(acc.pubkey);
            if (accountInfo?.value?.amount && accountInfo.value.amount !== "0") {
              // Parse the account data to get mint
              const accountData: any = (acc.account as any).data;
              let mint = "";
              // Token account structure: mint (32 bytes) + owner (32 bytes) + amount (8 bytes) + ...
              if (accountData && accountData.length >= 32) {
                const mintBytes = accountData.slice(0, 32);
                mint = new PublicKey(mintBytes).toBase58();
              }
              
              if (mint) {
                allTokens.push({
                  mint,
                  account: acc.pubkey.toBase58(),
                  amount: accountInfo.value.amount,
                  uiAmount: Number(accountInfo.value.uiAmountString ?? accountInfo.value.uiAmount ?? 0),
                  decimals: accountInfo.value.decimals,
                  program
                });
              }
            }
          } catch (err) {
            slog(`Error processing token account ${acc.pubkey.toBase58()}: ${String((err as Error)?.message || err)}`);
          }
        };

        for (const acc of classicAccounts.value) {
          await processAccount(acc, 'classic');
        }
        for (const acc of v22Accounts.value) {
          await processAccount(acc, 'token-2022');
        }
        slog(`Total non-zero token accounts found: ${allTokens.length}`);
      } catch (err) {
        slog("Error fetching all tokens: " + String((err as Error)?.message || err));
      }
    }

    return ok({
      publicKey: pub.toBase58(),
      solBalanceLamports: lamports,
      solBalance: lamports / 1_000_000_000,
      tokens: allTokens,
      ...tokenInfo,
      ...(debug ? { debugLogs: logs } : {}),
    });
  } catch (e) {
    console.error("trader-wallet error", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
