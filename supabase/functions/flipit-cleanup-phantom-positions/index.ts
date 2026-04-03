import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.87.6";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRpcUrl, getHeliusApiKey } from '../_shared/helius-client.ts';
enableHeliusTracking('flipit-cleanup-phantom-positions');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const DUST_THRESHOLD = 1;

serve(withRunLog('flipit-cleanup-phantom-positions', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const walletId = typeof body.walletId === 'string' ? body.walletId.trim() : '';

    if (!walletId) {
      return bad('walletId is required');
    }

    console.log('FlipIt Phantom Position Cleanup', { dryRun, walletId });

    const { data: wallet, error: walletErr } = await supabase
      .from("super_admin_wallets")
      .select("id, pubkey, label")
      .eq("id", walletId)
      .single();

    if (walletErr || !wallet) {
      return bad("Failed to load FlipIt wallet: " + (walletErr?.message || 'Wallet not found'), 404);
    }

    const { data: holdingPositions, error: posErr } = await supabase
      .from("flip_positions")
      .select("id, wallet_id, token_mint, token_symbol, status, buy_signature, buy_executed_at, created_at, quantity_tokens, buy_amount_usd, buy_price_usd")
      .eq("status", "holding")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false });

    if (posErr) {
      return bad("Failed to fetch positions: " + posErr.message);
    }

    console.log(`Found ${holdingPositions?.length || 0} holding positions for wallet ${wallet.pubkey}`);

    if (!holdingPositions || holdingPositions.length === 0) {
      return ok({
        walletId,
        walletPubkey: wallet.pubkey,
        walletLabel: wallet.label,
        message: "No holding positions found for selected wallet",
        totalHolding: 0,
        phantomCount: 0,
        validCount: 0,
        cleanedCount: 0,
        backfilledCount: 0,
        dryRun,
        results: [],
        phantomPositionIds: [],
      });
    }

    const rpcUrl = getHeliusApiKey()
      ? getHeliusRpcUrl()
      : "https://api.mainnet-beta.solana.com";

    const connection = new Connection(rpcUrl, "confirmed");
    const walletPk = new PublicKey(wallet.pubkey);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPk, {
      programId: TOKEN_PROGRAM_ID,
    });

    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(walletPk, {
      programId: TOKEN_2022_PROGRAM_ID,
    }).catch(() => ({ value: [] }));

    const actualHoldings = new Map<string, number>();
    for (const account of [...tokenAccounts.value, ...token2022Accounts.value]) {
      const info = account.account.data.parsed?.info;
      if (info?.mint && info?.tokenAmount?.uiAmount >= DUST_THRESHOLD) {
        actualHoldings.set(info.mint, info.tokenAmount.uiAmount);
      }
    }

    console.log(`Wallet ${wallet.pubkey} has ${actualHoldings.size} on-chain tokens (excluding dust < ${DUST_THRESHOLD})`);

    const positionsByToken = new Map<string, typeof holdingPositions>();
    for (const pos of holdingPositions) {
      if (!positionsByToken.has(pos.token_mint)) {
        positionsByToken.set(pos.token_mint, []);
      }
      positionsByToken.get(pos.token_mint)!.push(pos);
    }

    const results: any[] = [];
    const phantomPositions: string[] = [];

    for (const [tokenMint, tokenPositions] of positionsByToken) {
      const actualBalance = actualHoldings.get(tokenMint) || 0;
      const hasOnChain = actualBalance > 0;
      const totalInvested = tokenPositions.reduce((sum, pos) => sum + (pos.buy_amount_usd || 0), 0);

      for (const pos of tokenPositions) {
        results.push({
          positionId: pos.id,
          tokenMint: pos.token_mint,
          tokenSymbol: pos.token_symbol,
          buySignature: pos.buy_signature,
          hasOnChainBalance: hasOnChain,
          actualBalance,
          isPhantom: !hasOnChain,
          totalPositionsForToken: tokenPositions.length,
          createdAt: pos.created_at,
        });

        if (!hasOnChain) {
          phantomPositions.push(pos.id);
          console.log(`PHANTOM: ${pos.token_symbol} (${tokenMint}) - no on-chain balance found in selected wallet`);
          continue;
        }

        const posShare = totalInvested > 0 && tokenPositions.length > 1
          ? (pos.buy_amount_usd || 0) / totalInvested
          : 1;
        const expectedQuantity = actualBalance * posShare;
        const currentQty = pos.quantity_tokens;
        const needsBackfill = !currentQty ||
          (currentQty > 0 && expectedQuantity > 0 && (currentQty / expectedQuantity < 0.01 || currentQty / expectedQuantity > 100));

        if (needsBackfill && !dryRun && expectedQuantity > 0) {
          const correctedBuyPrice = (pos.buy_amount_usd && pos.buy_amount_usd > 0)
            ? pos.buy_amount_usd / expectedQuantity
            : null;

          const updateFields: Record<string, any> = { quantity_tokens: expectedQuantity };
          if (correctedBuyPrice !== null) {
            updateFields.buy_price_usd = correctedBuyPrice;
          }

          const { error: backfillErr } = await supabase
            .from("flip_positions")
            .update(updateFields)
            .eq("id", pos.id);

          if (backfillErr) {
            console.error(`Failed to backfill ${pos.id}:`, backfillErr);
          } else {
            console.log(`BACKFILLED: ${pos.token_symbol} quantity_tokens=${expectedQuantity}, buy_price_usd=${correctedBuyPrice}`);
          }
        } else if (needsBackfill && dryRun) {
          console.log(`WOULD BACKFILL: ${pos.token_symbol} from ${currentQty} → ${expectedQuantity} tokens`);
        }
      }
    }

    let cleanedCount = 0;
    if (!dryRun && phantomPositions.length > 0) {
      console.log(`Cleaning up ${phantomPositions.length} phantom positions for selected wallet...`);

      for (const posId of phantomPositions) {
        const { error: updateErr } = await supabase
          .from("flip_positions")
          .update({
            status: "sold",
            error_message: "Cleaned up: no on-chain balance found in selected wallet",
            sell_executed_at: new Date().toISOString(),
          })
          .eq("id", posId)
          .eq("wallet_id", walletId);

        if (updateErr) {
          console.error(`Failed to clean position ${posId}:`, updateErr);
        } else {
          cleanedCount++;
        }
      }
    }

    const backfilledCount = results.filter((result) => !result.isPhantom && result.hasOnChainBalance).length;

    return ok({
      walletId,
      walletPubkey: wallet.pubkey,
      walletLabel: wallet.label,
      totalHolding: holdingPositions.length,
      phantomCount: phantomPositions.length,
      validCount: holdingPositions.length - phantomPositions.length,
      cleanedCount,
      backfilledCount,
      dryRun,
      results,
      phantomPositionIds: phantomPositions,
    });
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return bad(err.message || "Unknown error", 500);
  }
}));
