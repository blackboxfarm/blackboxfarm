import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "npm:@solana/web3.js@1.95.3";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";
import { runTrollCycles } from "../_shared/troll-cycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEE_BUFFER_LAMPORTS = 10_000; // for the SystemProgram.transfer
const TROLL_RESERVE_LAMPORTS = 5_000_000; // ~0.005 SOL kept for the NEXT wallet's troll fees on top of leaveBehind

function randLeaveBehindLamports(balanceLamports: number): number {
  // Dynamic even-split fallback: target = balance/10, jitter ±15%.
  const target = Math.floor(balanceLamports / 10);
  const jitter = 1 + (Math.random() * 0.30 - 0.15);
  return Math.max(1, Math.floor(target * jitter));
}

function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim();
  const bytes = s.startsWith("[") ? new Uint8Array(JSON.parse(s)) : bs58.decode(s);
  return Keypair.fromSecretKey(bytes);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { columnIndex, plan: providedPlan, skipTroll: skipTrollRaw } = await req.json();
    const skipTroll = skipTrollRaw === true;
    if (typeof columnIndex !== "number" || columnIndex < 0 || columnIndex > 9) {
      throw new Error("columnIndex must be 0..9");
    }

    // Optional preview plan: array of {row, leaveBehindLamports} for rows 0..8
    let planMap: Record<number, number> | null = null;
    if (Array.isArray(providedPlan)) {
      planMap = {};
      for (const h of providedPlan) {
        if (typeof h?.row !== "number" || typeof h?.leaveBehindLamports !== "number") {
          throw new Error("plan entries must be { row, leaveBehindLamports }");
        }
        const lb = Math.floor(h.leaveBehindLamports);
        // Guard rails: 0.70 - 1.00 SOL
        if (lb < 0.01 * LAMPORTS_PER_SOL || lb > 5.00 * LAMPORTS_PER_SOL) {
          throw new Error(`plan row ${h.row} leaveBehind out of bounds (0.01-5.00 SOL)`);
        }
        planMap[h.row] = lb;
      }
    }

    const { data: wallets, error: werr } = await admin
      .from("waterfall_wallets")
      .select("id,row_index,nickname,pubkey,secret_key_encrypted")
      .eq("column_index", columnIndex)
      .gte("row_index", 0)
      .lte("row_index", 9)
      .order("row_index");
    if (werr) throw werr;
    if (!wallets || wallets.length !== 10) {
      throw new Error(`expected 10 wallets in column ${columnIndex}, found ${wallets?.length ?? 0}`);
    }

    const { data: runRow, error: rerr } = await admin
      .from("waterfall_cascade_runs")
      .insert({
        column_index: columnIndex,
        status: "running",
        current_wallet_row: 0,
        current_step: skipTroll ? "starting (skip troll)" : "starting",
        created_by: user.id,
        plan: providedPlan ?? null,
      })
      .select("id")
      .single();
    if (rerr) throw rerr;
    const runId = runRow!.id as string;

    const updateRun = async (patch: Record<string, unknown>) => {
      await admin
        .from("waterfall_cascade_runs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", runId);
    };

    const appendHop = async (entry: Record<string, unknown>) => {
      const { data: cur } = await admin
        .from("waterfall_cascade_runs")
        .select("hop_log")
        .eq("id", runId)
        .single();
      const log = Array.isArray(cur?.hop_log) ? (cur!.hop_log as unknown[]) : [];
      log.push(entry);
      await admin
        .from("waterfall_cascade_runs")
        .update({ hop_log: log, updated_at: new Date().toISOString() })
        .eq("id", runId);
    };

    // Run the long task in background so the HTTP request returns immediately
    const task = (async () => {
      const connection = new Connection(getHeliusRpcUrl(), "confirmed");
      try {
        for (let r = 0; r < 10; r++) {
          const w = wallets[r];
          const hopStart = Date.now();
          await updateRun({
            current_wallet_row: r,
            current_step: skipTroll ? `W${r + 1} skipping troll` : `W${r + 1} trolling`,
          });

          const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);
          const kp = keypairFromSecret(secret);
          if (kp.publicKey.toBase58() !== w.pubkey) throw new Error(`W${r + 1} key mismatch`);

          // TROLL with retries until 10 successful cycles or max attempts/cycle hit
          let trollSuccessCount = 0;
          if (!skipTroll) {
            const troll = await runTrollCycles(connection, kp, {
              cycles: 10,
              gapMs: 5000,
              maxAttemptsPerCycle: 20,
              onProgress: async (msg) => {
                await updateRun({ current_step: `W${r + 1} ${msg}` });
              },
            });
            if (troll.successCount < 10) {
              throw new Error(`W${r + 1} TROLL only completed ${troll.successCount}/10 cycles`);
            }
            trollSuccessCount = troll.successCount;
          }

          // Last wallet: terminal, do not forward
          if (r === 9) {
            await appendHop({
              row: r,
              pubkey: w.pubkey,
              trollCycles: trollSuccessCount,
              trollSkipped: skipTroll,
              forwarded: 0,
              leftBehindLamports: await connection.getBalance(kp.publicKey),
              durationMs: Date.now() - hopStart,
            });
            break;
          }

          // Forward to next wallet, leaving 0.75-0.95 SOL behind
          const next = wallets[r + 1];
          const destPk = new PublicKey(next.pubkey);
          const balance = await connection.getBalance(kp.publicKey);
          const leaveBehind = planMap && planMap[r] != null ? planMap[r] : randLeaveBehindLamports(balance);
          const sendable = balance - leaveBehind - FEE_BUFFER_LAMPORTS;

          if (sendable < TROLL_RESERVE_LAMPORTS) {
            throw new Error(
              `W${r + 1} cannot forward: balance ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL, ` +
              `leaveBehind ${(leaveBehind / LAMPORTS_PER_SOL).toFixed(6)} SOL ` +
              `would leave only ${(sendable / LAMPORTS_PER_SOL).toFixed(6)} SOL for W${r + 2} (need ≥0.005)`,
            );
          }

          await updateRun({ current_step: `W${r + 1} → W${r + 2} transfer (${(sendable / LAMPORTS_PER_SOL).toFixed(4)} SOL)` });

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          const tx = new Transaction({ recentBlockhash: blockhash, feePayer: kp.publicKey });
          tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: destPk, lamports: sendable }));
          tx.sign(kp);
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
          await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");

          await appendHop({
            row: r,
            pubkey: w.pubkey,
            trollCycles: trollSuccessCount,
            trollSkipped: skipTroll,
            leftBehindLamports: leaveBehind,
            forwardedLamports: sendable,
            transferSig: sig,
            durationMs: Date.now() - hopStart,
          });
        }

        await updateRun({
          status: "completed",
          current_step: "done",
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        const msg = (e as Error).message;
        console.error("[waterfall-cascade] failed:", msg);
        await updateRun({
          status: "failed",
          error: msg,
          completed_at: new Date().toISOString(),
        });
      }
    })();

    // Background-run support (Supabase Edge Runtime)
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      (EdgeRuntime as any).waitUntil(task);
    }

    return new Response(
      JSON.stringify({ success: true, runId, columnIndex, message: "cascade started in background" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("waterfall-cascade", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});