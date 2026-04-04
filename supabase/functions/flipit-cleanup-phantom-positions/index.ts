import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusRpcUrl } from '../_shared/helius-client.ts';

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

const DUST_THRESHOLD = 1;

/**
 * Fetch all fungible token holdings via Helius DAS API (getAssetsByOwner).
 * This is lightweight — no @solana/web3.js needed, avoids CPU timeout.
 */
async function getOnChainHoldings(walletPubkey: string): Promise<Map<string, number>> {
  const rpcUrl = getHeliusRpcUrl();
  const holdings = new Map<string, number>();
  let page = 1;

  while (true) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'cleanup-holdings',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletPubkey,
          page,
          limit: 1000,
          displayOptions: { showFungible: true },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Helius DAS error: ${res.status}`);
      break;
    }

    const json = await res.json();
    const items = json?.result?.items || [];

    for (const item of items) {
      if (item.interface !== 'FungibleToken' && item.interface !== 'FungibleAsset') continue;
      const mint = item.id;
      const tokenInfo = item.token_info || {};
      const balance = Number(tokenInfo.balance || 0);
      const decimals = Number(tokenInfo.decimals || 0);
      const uiAmount = decimals > 0 ? balance / Math.pow(10, decimals) : balance;
      if (uiAmount >= DUST_THRESHOLD) {
        holdings.set(mint, uiAmount);
      }
    }

    // Helius DAS pagination: if fewer items than limit, we're done
    if (items.length < 1000) break;
    page++;
  }

  return holdings;
}

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

    // 1. Load wallet
    const { data: wallet, error: walletErr } = await supabase
      .from("super_admin_wallets")
      .select("id, pubkey, label")
      .eq("id", walletId)
      .single();

    if (walletErr || !wallet) {
      return bad("Failed to load FlipIt wallet: " + (walletErr?.message || 'Wallet not found'), 404);
    }

    // 2. Load holding positions for this wallet
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

    // 3. Fetch on-chain holdings via Helius DAS API (lightweight, no CPU timeout)
    const actualHoldings = await getOnChainHoldings(wallet.pubkey);

    console.log(`Wallet ${wallet.pubkey} has ${actualHoldings.size} on-chain tokens (excluding dust < ${DUST_THRESHOLD})`);
    for (const [mint, bal] of actualHoldings) {
      console.log(`  On-chain: ${mint} = ${bal}`);
    }

    // 4. Group positions by token mint
    const positionsByToken = new Map<string, typeof holdingPositions>();
    for (const pos of holdingPositions) {
      if (!positionsByToken.has(pos.token_mint)) {
        positionsByToken.set(pos.token_mint, []);
      }
      positionsByToken.get(pos.token_mint)!.push(pos);
    }

    // 5. Compare DB vs on-chain
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
          console.log(`PHANTOM: ${pos.token_symbol} (${tokenMint}) - no on-chain balance found`);
          continue;
        }

        // Backfill quantity if needed
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

    // 6. Clean phantom positions
    let cleanedCount = 0;
    if (!dryRun && phantomPositions.length > 0) {
      console.log(`Cleaning up ${phantomPositions.length} phantom positions...`);

      for (const posId of phantomPositions) {
        const { error: updateErr } = await supabase
          .from("flip_positions")
          .update({
            status: "sold",
            error_message: "Cleaned up: no on-chain balance found in wallet",
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

    const backfilledCount = results.filter((r) => !r.isPhantom && r.hasOnChainBalance).length;

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
