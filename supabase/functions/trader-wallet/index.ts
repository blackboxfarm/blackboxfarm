import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, Keypair, PublicKey } from "npm:@solana/web3.js@1.95.3";
import { SecureStorage } from '../_shared/encryption.ts';
import bs58 from "npm:bs58@5.0.0";

// Lightweight ATA helper
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return addr;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-token, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  if (req.method !== "GET") return bad("Use GET", 405);

  try {
    // Optional token guard
    const fnToken = Deno.env.get("FUNCTION_TOKEN");
    if (fnToken) {
      const headerToken = req.headers.get("x-function-token") || (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
      if (headerToken !== fnToken) return bad("Unauthorized", 401);
    }

    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    const headerSecret = req.headers.get("x-owner-secret");
    const envSecret = Deno.env.get("TRADER_PRIVATE_KEY");
    if (!rpcUrl) return bad("Missing secret: SOLANA_RPC_URL", 500);
    if (!headerSecret && !envSecret) return bad("Missing secret: TRADER_PRIVATE_KEY or x-owner-secret", 500);

    // Decrypt if it's from header (encrypted from database)
    let secretToUse = envSecret!;
    if (headerSecret) {
      try {
        secretToUse = await SecureStorage.decryptWalletSecret(headerSecret);
      } catch (error) {
        return bad(`Failed to decrypt wallet secret: ${error.message}`, 400);
      }
    }

    const kp = parseKeypair(secretToUse);
    const pub = kp.publicKey;
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });
    const lamports = await connection.getBalance(pub).catch(() => 0);

    // Optional token balance query
    const url = new URL(req.url);
    const tokenMint = url.searchParams.get("tokenMint");
    let tokenInfo: Record<string, unknown> = {};
    if (tokenMint) {
      try {
        const mintPk = new PublicKey(tokenMint);
        const ata = getAssociatedTokenAddress(mintPk, pub);
        const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
        if (bal?.value) {
          tokenInfo = {
            tokenMint,
            tokenAccount: ata.toBase58(),
            tokenBalanceRaw: bal.value.amount,
            tokenDecimals: bal.value.decimals,
            tokenUiAmount: Number(bal.value.uiAmountString ?? bal.value.uiAmount ?? 0),
          };
        } else {
          tokenInfo = { tokenMint, tokenAccount: ata.toBase58(), tokenBalanceRaw: "0", tokenDecimals: 0, tokenUiAmount: 0 };
        }
      } catch (err) {
        tokenInfo = { tokenMint, tokenError: String((err as Error)?.message || err) };
      }
    }

    return ok({
      publicKey: pub.toBase58(),
      solBalanceLamports: lamports,
      solBalance: lamports / 1_000_000_000,
      ...tokenInfo,
    });
  } catch (e) {
    console.error("trader-wallet error", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
