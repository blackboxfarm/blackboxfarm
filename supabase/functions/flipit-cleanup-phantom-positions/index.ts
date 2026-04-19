import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from '../_shared/helius-client.ts';
import { parseBuyFromHelius } from '../_shared/helius-api.ts';
import { fetchSolPrice } from '../_shared/price-resolver.ts';
import { assertInsert, assertUpdate } from '../_shared/db-assert.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUST_THRESHOLD = 1;
const DEFAULT_TARGET_MULTIPLIER = 100;
const HISTORY_LIMIT = 200;

type FlipPositionRow = {
  id: string;
  wallet_id: string | null;
  token_mint: string;
  token_symbol: string | null;
  token_name?: string | null;
  token_image?: string | null;
  status: string | null;
  buy_signature: string | null;
  buy_executed_at: string | null;
  created_at: string;
  quantity_tokens: number | null;
  buy_amount_usd: number | null;
  buy_amount_sol?: number | null;
  buy_price_usd: number | null;
  target_multiplier?: number | null;
  target_price_usd?: number | null;
  source?: string | null;
  source_channel_id?: string | null;
};

type WalletRow = {
  id: string;
  pubkey: string;
  label: string | null;
};

type TokenMetadataRow = {
  symbol: string | null;
  name: string | null;
  image: string | null;
};

type OnChainHolding = {
  mint: string;
  uiAmount: number;
  rawAmount: string;
  decimals: number;
};

type HistoryTx = {
  signature: string;
  timestamp?: number;
  tokenTransfers?: Array<{
    mint?: string;
    toUserAccount?: string;
    fromUserAccount?: string;
  }>;
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

async function getOnChainHoldings(walletPubkey: string): Promise<Map<string, OnChainHolding>> {
  const rpcUrl = getHeliusRpcUrl();
  const holdings = new Map<string, OnChainHolding>();
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
      throw new Error(`Helius DAS error: ${res.status}`);
    }

    const json = await res.json();
    const items = json?.result?.items || [];

    for (const item of items) {
      if (item.interface !== 'FungibleToken' && item.interface !== 'FungibleAsset') continue;
      const mint = String(item.id || '');
      if (!mint) continue;
      const tokenInfo = item.token_info || {};
      const rawAmount = String(tokenInfo.balance || '0');
      const decimals = Number(tokenInfo.decimals || 0);
      const uiAmount = decimals > 0 ? Number(rawAmount) / Math.pow(10, decimals) : Number(rawAmount);
      if (!Number.isFinite(uiAmount) || uiAmount < DUST_THRESHOLD) continue;
      holdings.set(mint, { mint, uiAmount, rawAmount, decimals });
    }

    if (items.length < 1000) break;
    page += 1;
    if (page > 5) break;
  }

  return holdings;
}

async function fetchWalletHistory(walletPubkey: string): Promise<HistoryTx[]> {
  const historyUrl = getHeliusRestUrl(`/v0/addresses/${walletPubkey}/transactions`, { limit: String(HISTORY_LIMIT) });
  const res = await fetch(historyUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch wallet history: ${res.status}`);
  }
  const txs = await res.json();
  return Array.isArray(txs) ? txs : [];
}

function findBuySignatureForMint(transactions: HistoryTx[], tokenMint: string, walletPubkey: string): string | null {
  for (const tx of transactions) {
    if (!Array.isArray(tx.tokenTransfers)) continue;
    const match = tx.tokenTransfers.find((transfer) => transfer?.mint === tokenMint && transfer?.toUserAccount === walletPubkey);
    if (match?.mint && tx.signature) return tx.signature;
  }
  return null;
}

async function fetchTokenMetadata(tokenMint: string): Promise<TokenMetadataRow> {
  try {
    const metaUrl = getHeliusRestUrl('/v0/token-metadata');
    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [tokenMint] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!metaRes.ok) return { symbol: null, name: null, image: null };
    const metaData = await metaRes.json();
    const row = Array.isArray(metaData) ? metaData[0] : null;
    return {
      symbol: row?.onChainMetadata?.metadata?.data?.symbol || row?.legacyMetadata?.symbol || null,
      name: row?.onChainMetadata?.metadata?.data?.name || row?.legacyMetadata?.name || null,
      image: row?.offChainMetadata?.metadata?.image || null,
    };
  } catch {
    return { symbol: null, name: null, image: null };
  }
}

serve(withRunLog('flipit-cleanup-phantom-positions', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = getHeliusApiKey();
    if (!heliusApiKey) return bad('HELIUS_API_KEY required', 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const walletId = typeof body.walletId === 'string' ? body.walletId.trim() : '';

    if (!walletId) return bad('walletId is required');

    const { data: wallet, error: walletErr } = await supabase
      .from('super_admin_wallets')
      .select('id, pubkey, label')
      .eq('id', walletId)
      .single<WalletRow>();

    if (walletErr || !wallet) {
      return bad(`Failed to load FlipIt wallet: ${walletErr?.message || 'Wallet not found'}`, 404);
    }

    const { data: walletPositions, error: posErr } = await supabase
      .from('flip_positions')
      .select('id, wallet_id, token_mint, token_symbol, token_name, token_image, status, buy_signature, buy_executed_at, created_at, quantity_tokens, buy_amount_usd, buy_amount_sol, buy_price_usd, target_multiplier, target_price_usd, source, source_channel_id')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false });

    if (posErr) {
      return bad(`Failed to fetch positions: ${posErr.message}`);
    }

    const positions = (walletPositions || []) as FlipPositionRow[];
    const holdingPositions = positions.filter((pos) => pos.status === 'holding');
    const activeStatuses = new Set(['holding', 'pending_buy', 'pending_sell', 'bought', 'open', 'active']);
    const activePositions = positions.filter((pos) => activeStatuses.has(pos.status || ''));

    const [actualHoldings, transactions, solPrice] = await Promise.all([
      getOnChainHoldings(wallet.pubkey),
      fetchWalletHistory(wallet.pubkey),
      fetchSolPrice(),
    ]);

    const positionsByToken = new Map<string, FlipPositionRow[]>();
    for (const pos of holdingPositions) {
      if (!positionsByToken.has(pos.token_mint)) positionsByToken.set(pos.token_mint, []);
      positionsByToken.get(pos.token_mint)!.push(pos);
    }

    const results: any[] = [];
    const phantomPositions: string[] = [];
    let cleanedCount = 0;
    let backfilledCount = 0;
    let importedCount = 0;
    const importedPositions: any[] = [];

    for (const [tokenMint, tokenPositions] of positionsByToken.entries()) {
      const actual = actualHoldings.get(tokenMint);
      const actualBalance = actual?.uiAmount || 0;
      const hasOnChain = actualBalance > 0;
      const totalInvested = tokenPositions.reduce((sum, pos) => sum + (pos.buy_amount_usd || 0), 0);

      for (const pos of tokenPositions) {
        const currentQty = Number(pos.quantity_tokens || 0);
        const posShare = totalInvested > 0 && tokenPositions.length > 1
          ? (pos.buy_amount_usd || 0) / totalInvested
          : 1;
        const expectedQuantity = actualBalance > 0 ? actualBalance * posShare : 0;
        const needsBackfill = hasOnChain && (!currentQty || (expectedQuantity > 0 && (currentQty / expectedQuantity < 0.01 || currentQty / expectedQuantity > 100)));

        results.push({
          type: 'existing',
          positionId: pos.id,
          tokenMint: pos.token_mint,
          tokenSymbol: pos.token_symbol,
          status: pos.status,
          actualBalance,
          hasOnChainBalance: hasOnChain,
          needsBackfill,
          buySignature: pos.buy_signature,
          createdAt: pos.created_at,
        });

        if (!hasOnChain) {
          phantomPositions.push(pos.id);
          if (!dryRun) {
            await assertUpdate(
              supabase
                .from('flip_positions')
                .update({
                  status: 'sold',
                  error_message: 'Cleaned up: no on-chain balance found in wallet',
                  sell_executed_at: new Date().toISOString(),
                  ghost_position: true,
                  needs_reconciliation: true,
                  last_chain_sync_at: new Date().toISOString(),
                })
                .eq('id', pos.id)
                .eq('wallet_id', walletId),
              'flip_positions'
            );
            cleanedCount += 1;
          }
          continue;
        }

        if (needsBackfill && !dryRun && actual) {
          const correctedBuyPrice = pos.buy_amount_usd && pos.buy_amount_usd > 0 ? pos.buy_amount_usd / expectedQuantity : null;
          const updateFields: Record<string, any> = {
            quantity_tokens: expectedQuantity,
            quantity_tokens_raw: actual.rawAmount,
            token_decimals: actual.decimals,
            ghost_position: false,
            needs_reconciliation: false,
            last_chain_sync_at: new Date().toISOString(),
          };
          if (correctedBuyPrice !== null) updateFields.buy_price_usd = correctedBuyPrice;
          await assertUpdate(
            supabase.from('flip_positions').update(updateFields).eq('id', pos.id),
            'flip_positions'
          );
          backfilledCount += 1;
        }
      }
    }

    const knownActiveMints = new Set(activePositions.map((pos) => pos.token_mint));
    for (const [tokenMint, holding] of actualHoldings.entries()) {
      if (knownActiveMints.has(tokenMint)) continue;

      const buySignature = findBuySignatureForMint(transactions, tokenMint, wallet.pubkey);
      if (!buySignature) {
        results.push({
          type: 'missing_live_holding',
          tokenMint,
          actualBalance: holding.uiAmount,
          imported: false,
          reason: 'No buy signature found in recent wallet history',
        });
        continue;
      }

      const parsedBuy = await parseBuyFromHelius(buySignature, tokenMint, wallet.pubkey, heliusApiKey);
      if (!parsedBuy || parsedBuy.tokensReceived <= 0) {
        results.push({
          type: 'missing_live_holding',
          tokenMint,
          actualBalance: holding.uiAmount,
          imported: false,
          reason: 'Failed to parse buy transaction from Helius',
          buySignature,
        });
        continue;
      }

      const tokenMeta = await fetchTokenMetadata(tokenMint);
      const buyAmountUsd = parsedBuy.solSpent * solPrice;
      const buyPriceUsd = buyAmountUsd / parsedBuy.tokensReceived;
      const targetMultiplier = DEFAULT_TARGET_MULTIPLIER;
      const targetPriceUsd = buyPriceUsd * targetMultiplier;

      const importPreview = {
        tokenMint,
        tokenSymbol: tokenMeta.symbol,
        actualBalance: holding.uiAmount,
        buySignature,
        buyAmountSol: parsedBuy.solSpent,
        buyAmountUsd,
        buyPriceUsd,
        imported: !dryRun,
      };
      results.push({ type: 'imported_live_holding', ...importPreview });

      if (dryRun) continue;

      const inserted = await assertInsert(
        supabase
          .from('flip_positions')
          .insert({
            wallet_id: walletId,
            token_mint: tokenMint,
            token_symbol: tokenMeta.symbol,
            token_name: tokenMeta.name,
            token_image: tokenMeta.image,
            buy_amount_usd: buyAmountUsd,
            buy_amount_sol: parsedBuy.solSpent,
            buy_price_usd: buyPriceUsd,
            quantity_tokens: holding.uiAmount,
            quantity_tokens_raw: holding.rawAmount,
            token_decimals: holding.decimals,
            buy_signature: buySignature,
            buy_executed_at: parsedBuy.timestamp ? new Date(parsedBuy.timestamp * 1000).toISOString() : new Date().toISOString(),
            target_multiplier: targetMultiplier,
            target_price_usd: targetPriceUsd,
            status: 'holding',
            source: 'chain_sync',
            is_test_position: false,
            entry_verified: true,
            entry_verified_at: new Date().toISOString(),
            ghost_position: false,
            needs_reconciliation: false,
            last_chain_sync_at: new Date().toISOString(),
          })
          .select('id, token_mint, token_symbol, buy_signature')
          .single(),
        'flip_positions'
      );

      importedCount += 1;
      importedPositions.push(inserted);
      knownActiveMints.add(tokenMint);
    }

    return ok({
      walletId,
      walletPubkey: wallet.pubkey,
      walletLabel: wallet.label,
      dryRun,
      totalPositions: positions.length,
      totalHolding: holdingPositions.length,
      onChainHoldingCount: actualHoldings.size,
      phantomCount: phantomPositions.length,
      validCount: holdingPositions.length - phantomPositions.length,
      cleanedCount,
      backfilledCount,
      importedCount,
      importedPositions,
      results,
      phantomPositionIds: phantomPositions,
    });
  } catch (err: any) {
    console.error('Cleanup error:', err);
    return bad(err.message || 'Unknown error', 500);
  }
}));
