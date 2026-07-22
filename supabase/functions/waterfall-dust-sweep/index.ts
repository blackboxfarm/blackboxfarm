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
import {
  createBurnInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "npm:@solana/spl-token@0.4.8";
import bs58 from "npm:bs58@6.0.0";
import { getHeliusRpcUrl } from "../_shared/helius-client.ts";
import { decryptWalletSecretAuto } from "../_shared/decrypt-wallet-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseKeypair(secret: string): Keypair {
  const t = secret.trim();
  if (t.startsWith("[")) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(t)));
  return Keypair.fromSecretKey(bs58.decode(t));
}

const IX_PER_TX = 10;
const FEE_BUFFER_LAMPORTS = 10_000; // headroom for signature + priority

function isPreviewOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    const host = new URL(origin).hostname;
    return /^id-preview--.*\.lovable\.app$/.test(host) || /(^|\.)lovable\.dev$/.test(host) || /(^|\.)lovableproject\.com$/.test(host);
  } catch {
    return false;
  }
}

interface WalletReport {
  index: number;
  pubkey: string;
  starting_sol: number;
  accounts_scanned: number;
  accounts_closed: number;
  tokens_burned: number;
  burn_close_tx: string[];
  ending_sol: number;
  forwarded_sol: number;
  forward_tx?: string;
  errors: string[];
}

async function sweepWallet(
  connection: Connection,
  kp: Keypair,
  dryRun: boolean,
): Promise<Omit<WalletReport, "index" | "forwarded_sol" | "forward_tx">> {
  const report = {
    pubkey: kp.publicKey.toBase58(),
    starting_sol: 0,
    accounts_scanned: 0,
    accounts_closed: 0,
    tokens_burned: 0,
    burn_close_tx: [] as string[],
    ending_sol: 0,
    errors: [] as string[],
  };

  report.starting_sol = (await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;

  const programs = [
    { id: TOKEN_PROGRAM_ID, label: "spl" },
    { id: TOKEN_2022_PROGRAM_ID, label: "spl22" },
  ];

  type Acc = {
    ata: PublicKey;
    mint: PublicKey;
    amount: bigint;
    programId: PublicKey;
  };
  const accounts: Acc[] = [];

  for (const p of programs) {
    try {
      const res = await connection.getParsedTokenAccountsByOwner(kp.publicKey, { programId: p.id });
      for (const { pubkey, account } of res.value) {
        const info: any = account.data.parsed?.info;
        if (!info) continue;
        const amt = BigInt(info.tokenAmount?.amount ?? "0");
        accounts.push({
          ata: pubkey,
          mint: new PublicKey(info.mint),
          amount: amt,
          programId: p.id,
        });
      }
    } catch (e) {
      report.errors.push(`enumerate ${p.label}: ${(e as Error).message}`);
    }
  }

  report.accounts_scanned = accounts.length;
  if (accounts.length === 0) {
    report.ending_sol = report.starting_sol;
    return report;
  }

  if (dryRun) {
    report.accounts_closed = accounts.length;
    report.tokens_burned = accounts.filter((a) => a.amount > 0n).length;
    report.ending_sol = report.starting_sol + accounts.length * 0.00203928;
    return report;
  }

  // Batch build & send transactions
  for (let i = 0; i < accounts.length; i += IX_PER_TX) {
    const chunk = accounts.slice(i, i + IX_PER_TX);
    const tx = new Transaction();
    for (const a of chunk) {
      if (a.amount > 0n) {
        tx.add(
          createBurnInstruction(a.ata, a.mint, kp.publicKey, a.amount, [], a.programId),
        );
      }
      tx.add(
        createCloseAccountInstruction(a.ata, kp.publicKey, kp.publicKey, [], a.programId),
      );
    }
    try {
      const bh = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = bh.blockhash;
      tx.feePayer = kp.publicKey;
      tx.sign(kp);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        "confirmed",
      );
      report.burn_close_tx.push(sig);
      report.accounts_closed += chunk.length;
      report.tokens_burned += chunk.filter((a) => a.amount > 0n).length;
    } catch (e) {
      report.errors.push(`batch ${i / IX_PER_TX}: ${(e as Error).message}`);
    }
  }

  report.ending_sol = (await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  return report;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const admin = createClient(supabaseUrl, serviceKey);
    let user: { id: string } | null = null;
    let allowed = false;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: u } } = await userClient.auth.getUser();
      if (u) {
        user = { id: u.id };
        const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.id });
        allowed = isSuper === true;
      }
    }

    // Preview-admin bypass on Lovable preview origins (matches waterfall-list-wallets).
    if (!allowed && isPreviewOrigin(req)) {
      allowed = true;
      if (!user) user = { id: "00000000-0000-0000-0000-000000000000" };
    }

    if (!allowed) return jsonRes({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const waterfallColumn = Number(body.waterfall_column ?? 0); // 0 = Waterfall 1
    const startRow = Number(body.start_row ?? 0);
    const endRow = Number(body.end_row ?? 9);
    const dryRun = Boolean(body.dry_run ?? true);

    const { data: wallets, error: werr } = await admin
      .from("waterfall_wallets")
      .select("id, pubkey, secret_key_encrypted, row_index, nickname")
      .eq("column_index", waterfallColumn)
      .gte("row_index", startRow)
      .lte("row_index", endRow)
      .order("row_index", { ascending: true });

    if (werr || !wallets || wallets.length === 0) {
      return jsonRes({ error: "No wallets found", details: werr?.message }, 404);
    }

    const connection = new Connection(getHeliusRpcUrl(), "confirmed");
    const reports: WalletReport[] = [];

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const next = wallets[i + 1];
      const walletReport: WalletReport = {
        index: w.row_index,
        pubkey: w.pubkey,
        starting_sol: 0,
        accounts_scanned: 0,
        accounts_closed: 0,
        tokens_burned: 0,
        burn_close_tx: [],
        ending_sol: 0,
        forwarded_sol: 0,
        errors: [],
      };

      let kp: Keypair;
      try {
        const secret = await decryptWalletSecretAuto(w.secret_key_encrypted as string);
        kp = parseKeypair(secret);
        if (kp.publicKey.toBase58() !== w.pubkey) throw new Error("key mismatch");
      } catch (e) {
        walletReport.errors.push(`decrypt: ${(e as Error).message}`);
        reports.push(walletReport);
        continue;
      }

      const sub = await sweepWallet(connection, kp, dryRun);
      Object.assign(walletReport, sub);

      // Forward SOL to next wallet (skip if last or dry run)
      if (next && !dryRun) {
        try {
          const bal = await connection.getBalance(kp.publicKey);
          const lamports = bal - FEE_BUFFER_LAMPORTS;
          if (lamports > 0) {
            const bh = await connection.getLatestBlockhash("confirmed");
            const tx = new Transaction({
              recentBlockhash: bh.blockhash,
              feePayer: kp.publicKey,
            }).add(
              SystemProgram.transfer({
                fromPubkey: kp.publicKey,
                toPubkey: new PublicKey(next.pubkey),
                lamports,
              }),
            );
            tx.sign(kp);
            const sig = await connection.sendRawTransaction(tx.serialize(), {
              skipPreflight: false,
              maxRetries: 3,
            });
            await connection.confirmTransaction(
              {
                signature: sig,
                blockhash: bh.blockhash,
                lastValidBlockHeight: bh.lastValidBlockHeight,
              },
              "confirmed",
            );
            walletReport.forwarded_sol = lamports / LAMPORTS_PER_SOL;
            walletReport.forward_tx = sig;
          }
        } catch (e) {
          walletReport.errors.push(`forward: ${(e as Error).message}`);
        }
      } else if (next && dryRun) {
        walletReport.forwarded_sol = Math.max(
          0,
          walletReport.ending_sol - FEE_BUFFER_LAMPORTS / LAMPORTS_PER_SOL,
        );
      }

      reports.push(walletReport);
    }

    // Log
    await admin.from("activity_logs").insert({
      message: `Waterfall dust sweep ${dryRun ? "(dry run) " : ""}column ${waterfallColumn} rows ${startRow}-${endRow}`,
      log_level: "info",
      metadata: {
        action: "waterfall_dust_sweep",
        dry_run: dryRun,
        reports,
        executed_by: user.id,
      },
    });

    return jsonRes({
      success: true,
      dry_run: dryRun,
      waterfall_column: waterfallColumn,
      wallets: reports,
      summary: {
        wallets: reports.length,
        accounts_closed: reports.reduce((a, r) => a + r.accounts_closed, 0),
        tokens_burned: reports.reduce((a, r) => a + r.tokens_burned, 0),
        total_forwarded_sol: reports.reduce((a, r) => a + r.forwarded_sol, 0),
      },
    });
  } catch (e) {
    console.error("[waterfall-dust-sweep]", e);
    return jsonRes({ error: (e as Error).message }, 500);
  }
});