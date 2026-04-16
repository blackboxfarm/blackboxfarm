import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "npm:tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { SecureStorage } from "../_shared/encryption.ts";
import { getHeliusRpcUrl } from '../_shared/helius-client.ts';
import { assertInsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HELIUS_RPC = getHeliusRpcUrl();
const LAMPORTS_PER_SOL = 1_000_000_000;
const SYSTEM_PROGRAM_ID = new Uint8Array(32); // 11111111111111111111111111111111 = all zeros

async function rpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

// ---- Lightweight Solana transaction builder (no @solana/web3.js needed) ----

function encodeShortVec(length: number): Uint8Array {
  const bytes: number[] = [];
  let n = length;
  while (true) {
    let b = n & 0x7f;
    n >>= 7;
    if (n === 0) { bytes.push(b); break; }
    bytes.push(b | 0x80);
  }
  return new Uint8Array(bytes);
}

function u64LE(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, BigInt(value), true);
  return buf;
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

/**
 * Build a legacy Solana transfer transaction (single SystemProgram.transfer).
 * Returns base64-encoded signed transaction.
 */
function buildSignedTransfer(
  fromSecretKey: Uint8Array,   // 64 bytes (ed25519 secret + pubkey)
  fromPubkey: Uint8Array,      // 32 bytes
  toPubkey: Uint8Array,        // 32 bytes
  lamports: number,
  recentBlockhashB58: string,
): string {
  const blockhash = bs58.decode(recentBlockhashB58); // 32 bytes

  // Account keys: [from (signer, writable), to (writable), system program (readonly)]
  const accountKeys = [fromPubkey, toPubkey, SYSTEM_PROGRAM_ID];

  // Message header: numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts
  const header = new Uint8Array([1, 0, 1]);

  // Account keys section
  const accountKeysSection = concatBytes(
    encodeShortVec(accountKeys.length),
    ...accountKeys,
  );

  // Instructions: 1 instruction
  // Instruction = programIdIndex (u8) + accountsVec + dataVec
  // SystemProgram.transfer data = u32 LE instruction index (2) + u64 LE lamports
  const ixData = new Uint8Array(12);
  const dv = new DataView(ixData.buffer);
  dv.setUint32(0, 2, true); // transfer = 2
  ixData.set(u64LE(lamports), 4);

  const ixAccounts = new Uint8Array([0, 1]); // from, to
  const instruction = concatBytes(
    new Uint8Array([2]),                    // programIdIndex = 2 (system program)
    encodeShortVec(ixAccounts.length),
    ixAccounts,
    encodeShortVec(ixData.length),
    ixData,
  );

  const instructionsSection = concatBytes(
    encodeShortVec(1),
    instruction,
  );

  const message = concatBytes(
    header,
    accountKeysSection,
    blockhash,
    instructionsSection,
  );

  // Sign message
  const signature = nacl.sign.detached(message, fromSecretKey);

  // Final tx = signaturesVec + message
  const tx = concatBytes(
    encodeShortVec(1),
    signature,
    message,
  );

  // base64 encode
  let bin = '';
  for (let i = 0; i < tx.length; i++) bin += String.fromCharCode(tx[i]);
  return btoa(bin);
}

serve(withRunLog('flipit-wallet-withdrawal', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isSuperAdmin, error: isSuperAdminError } = await supabase.rpc(
      "is_super_admin", { _user_id: user.id }
    );
    if (isSuperAdminError) {
      console.error('[flipit-withdrawal] is_super_admin RPC failed:', isSuperAdminError);
      return new Response(JSON.stringify({ error: "Authorization check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { walletId, destinationAddress, amount } = await req.json();

    if (!walletId) {
      return new Response(JSON.stringify({ error: "Wallet ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!destinationAddress) {
      return new Response(JSON.stringify({ error: "Destination address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (amount !== undefined && amount !== null && (typeof amount !== 'number' || amount <= 0)) {
      return new Response(JSON.stringify({ error: "Invalid amount. Must be a positive number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[flipit-withdrawal] Processing withdrawal for wallet: ${walletId}`);

    const { data: wallet, error: walletError } = await supabase
      .from("super_admin_wallets")
      .select("id,pubkey,secret_key_encrypted")
      .eq("id", walletId)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const secretKeyBase58 = await SecureStorage.decryptWalletSecret(wallet.secret_key_encrypted);
    const secretKeyBytes = bs58.decode(secretKeyBase58);
    if (secretKeyBytes.length !== 64) {
      return new Response(JSON.stringify({ error: `Invalid secret key length: ${secretKeyBytes.length}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const fromPubkey = secretKeyBytes.slice(32, 64);
    const fromPubkeyB58 = bs58.encode(fromPubkey);

    if (fromPubkeyB58 !== wallet.pubkey) {
      console.warn(`[flipit-withdrawal] Pubkey mismatch! db=${wallet.pubkey} derived=${fromPubkeyB58}`);
    }

    console.log(`[flipit-withdrawal] Wallet pubkey: ${fromPubkeyB58}`);

    // Get balance + recent blockhash in parallel
    const [balanceRes, blockhashRes] = await Promise.all([
      rpc('getBalance', [fromPubkeyB58]),
      rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
    ]);
    const balance: number = balanceRes.value;
    const blockhash: string = blockhashRes.value.blockhash;
    const solBalance = balance / LAMPORTS_PER_SOL;

    console.log(`[flipit-withdrawal] Current balance: ${solBalance} SOL`);

    if (balance < 5000) {
      return new Response(JSON.stringify({ error: "Insufficient balance for withdrawal", balance: solBalance }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let toPubkey: Uint8Array;
    try {
      toPubkey = bs58.decode(destinationAddress);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid destination address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (toPubkey.length !== 32) {
      return new Response(JSON.stringify({ error: "Invalid destination address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const feeBuffer = 10000;
    let amountToSend: number;

    if (amount !== undefined && amount !== null) {
      amountToSend = Math.floor(amount * LAMPORTS_PER_SOL);
      if (amountToSend + feeBuffer > balance) {
        return new Response(JSON.stringify({
          error: `Insufficient balance. Requested ${amount} SOL but only ${((balance - feeBuffer) / LAMPORTS_PER_SOL).toFixed(4)} SOL available.`,
          balance: solBalance
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      amountToSend = balance - feeBuffer;
    }

    if (amountToSend <= 0) {
      return new Response(JSON.stringify({ error: "Balance too low to withdraw" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const base64Tx = buildSignedTransfer(
      secretKeyBytes,
      fromPubkey,
      toPubkey,
      amountToSend,
      blockhash,
    );

    const signature: string = await rpc('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }
    ]);

    console.log(`[flipit-withdrawal] Transaction sent: ${signature}`);

    const withdrawnAmount = amountToSend / LAMPORTS_PER_SOL;
    const destinationB58 = bs58.encode(toPubkey);

    await assertInsert(
      supabase.from("activity_logs").insert({
        message: `FlipIt wallet withdrawal: ${withdrawnAmount.toFixed(4)} SOL to ${destinationB58.slice(0, 8)}...`,
        log_level: "info",
        metadata: {
          wallet_id: walletId,
          amount_sol: withdrawnAmount,
          destination: destinationB58,
          signature,
          user_id: user.id
        }
      }),
      "activity_logs"
    );

    return new Response(JSON.stringify({
      success: true,
      signature,
      amountSol: withdrawnAmount,
      destination: destinationB58,
      explorerUrl: `https://solscan.io/tx/${signature}`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[flipit-withdrawal] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}));
