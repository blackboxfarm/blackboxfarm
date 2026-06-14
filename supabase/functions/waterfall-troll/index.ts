import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";
import { runTrollCycles, DEFAULT_BUY_LAMPORTS } from "../_shared/troll-cycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CYCLES = 10;
const BUY_LAMPORTS = DEFAULT_BUY_LAMPORTS;

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
    // Pre-flight: need at least BUY_LAMPORTS * CYCLES + buffer for fees
    const startBalance = await connection.getBalance(kp.publicKey);
    const minNeeded = BUY_LAMPORTS * CYCLES + 5_000_000; // ~0.005 SOL fee buffer
    if (startBalance < minNeeded) {
      throw new Error(`insufficient SOL: have ${(startBalance / LAMPORTS_PER_SOL).toFixed(6)}, need ~${(minNeeded / LAMPORTS_PER_SOL).toFixed(6)}`);
    }

    const { cycles } = await runTrollCycles(connection, kp, {
      cycles: CYCLES,
      gapMs: 5000,
      maxAttemptsPerCycle: 1, // single-shot mode — caller used to expect "fail and report"
    });

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