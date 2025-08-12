import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Connection, Keypair, PublicKey } from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-token",
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
    const secret = Deno.env.get("TRADER_PRIVATE_KEY");
    if (!rpcUrl) return bad("Missing secret: SOLANA_RPC_URL", 500);
    if (!secret) return bad("Missing secret: TRADER_PRIVATE_KEY", 500);

    const kp = parseKeypair(secret);
    const pub = kp.publicKey;
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });
    const lamports = await connection.getBalance(pub).catch(() => 0);

    return ok({
      publicKey: pub.toBase58(),
      solBalanceLamports: lamports,
      solBalance: lamports / 1_000_000_000,
    });
  } catch (e) {
    console.error("trader-wallet error", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
