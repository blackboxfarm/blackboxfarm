/**
 * flipit-lp-reclaim
 *
 * Imports a Meteora LP withdrawal/dissolution transaction as a synthetic
 * "Reclaimed" flip_position. No PnL is calculated against an original buy —
 * the LP collapse moment becomes the new synthetic buy timestamp & price.
 *
 * Body:
 *   {
 *     signature: string,            // LP withdrawal tx signature (required)
 *     pool_address?: string,        // Meteora pool address (optional, for reference)
 *     wallet_id?: string,           // FlipIt wallet UUID receiving the tokens (auto-detected if omitted)
 *     wallet_pubkey?: string,       // Or wallet pubkey directly
 *     token_mint?: string,          // If known, restricts to this mint (skips SOL/WSOL/USDC)
 *   }
 *
 * Returns: { ok: true, position: {...} } or { error: '...' }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertInsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const SKIP_MINTS = new Set([SOL_MINT, USDC_MINT, USDT_MINT]);

interface HeliusTokenTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  mint: string;
  tokenAmount: number;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  type?: string;
  description?: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }>;
}

async function fetchHeliusTx(signature: string): Promise<HeliusTx | null> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusKey) throw new Error('HELIUS_API_KEY not configured');

  const url = `https://api.helius.xyz/v0/transactions?api-key=${heliusKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: [signature] }),
  });
  if (!res.ok) {
    console.error(`Helius tx fetch failed: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function fetchTokenMetadata(mint: string): Promise<{ symbol: string | null; name: string | null; decimals: number | null; image: string | null }> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusKey) return { symbol: null, name: null, decimals: null, image: null };

  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getAsset',
        params: { id: mint },
      }),
    });
    if (!res.ok) return { symbol: null, name: null, decimals: null, image: null };
    const data = await res.json();
    const meta = data?.result?.content?.metadata;
    const decimals = data?.result?.token_info?.decimals ?? null;
    const image = data?.result?.content?.links?.image || data?.result?.content?.files?.[0]?.uri || null;
    return {
      symbol: meta?.symbol ?? null,
      name: meta?.name ?? null,
      decimals,
      image,
    };
  } catch {
    return { symbol: null, name: null, decimals: null, image: null };
  }
}

async function fetchTokenPriceUsd(mint: string): Promise<number | null> {
  // Try DexScreener first (most reliable for arbitrary tokens)
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (res.ok) {
      const data = await res.json();
      const pair = data?.pairs?.[0];
      if (pair?.priceUsd) {
        const p = parseFloat(pair.priceUsd);
        if (Number.isFinite(p) && p > 0) return p;
      }
    }
  } catch (e) {
    console.warn('DexScreener price fetch failed:', e);
  }

  // Fallback: Jupiter price API
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (res.ok) {
      const data = await res.json();
      const price = data?.data?.[mint]?.price;
      if (price) {
        const p = parseFloat(price);
        if (Number.isFinite(p) && p > 0) return p;
      }
    }
  } catch (e) {
    console.warn('Jupiter price fetch failed:', e);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const isSuperAdmin = roles?.some((r: any) => r.role === 'super_admin');
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const signature = (body.signature || '').trim();
    const pool_address = (body.pool_address || '').trim() || null;
    const wallet_id_input = body.wallet_id || null;
    const wallet_pubkey_input = body.wallet_pubkey || null;
    const token_mint_filter = body.token_mint || null;

    if (!signature || signature.length < 64) {
      return new Response(JSON.stringify({ error: 'valid signature required' }), { status: 400, headers: corsHeaders });
    }

    // Resolve target wallet pubkey (the FlipIt wallet that received the tokens)
    let walletId: string | null = wallet_id_input;
    let walletPubkey: string | null = wallet_pubkey_input;

    if (walletId && !walletPubkey) {
      const { data: w } = await supabase
        .from('super_admin_wallets')
        .select('pubkey')
        .eq('id', walletId)
        .maybeSingle();
      walletPubkey = w?.pubkey || null;
    }
    if (!walletId && !walletPubkey) {
      // Default: FlipIt wallet
      const { data: wallets } = await supabase
        .from('super_admin_wallets')
        .select('id, pubkey')
        .eq('wallet_type', 'flipit')
        .eq('is_active', true)
        .limit(1);
      walletId = wallets?.[0]?.id || null;
      walletPubkey = wallets?.[0]?.pubkey || null;
    }
    if (!walletPubkey) {
      return new Response(JSON.stringify({ error: 'could not resolve wallet pubkey' }), { status: 400, headers: corsHeaders });
    }

    // Dedup check
    const { data: existing } = await supabase
      .from('flip_positions')
      .select('id, token_mint, token_symbol')
      .eq('lp_withdrawal_signature', signature)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        error: 'already_imported',
        message: `This LP withdrawal was already imported as position ${existing.id} (${existing.token_symbol || existing.token_mint})`,
        position_id: existing.id,
      }), { status: 409, headers: corsHeaders });
    }

    // Fetch the on-chain transaction
    const tx = await fetchHeliusTx(signature);
    if (!tx) {
      return new Response(JSON.stringify({ error: 'transaction not found on-chain (Helius)' }), { status: 404, headers: corsHeaders });
    }

    // Find SPL token transfers TO our wallet, skipping SOL/USDC/USDT
    const incoming = (tx.tokenTransfers || []).filter((t) => {
      if (t.toUserAccount !== walletPubkey) return false;
      if (SKIP_MINTS.has(t.mint)) return false;
      if (token_mint_filter && t.mint !== token_mint_filter) return false;
      return Number(t.tokenAmount) > 0;
    });

    if (incoming.length === 0) {
      return new Response(JSON.stringify({
        error: 'no_token_returned',
        message: `No SPL token transfers to wallet ${walletPubkey} found in this transaction (excluding SOL/USDC/USDT). Check the signature & wallet.`,
        wallet: walletPubkey,
      }), { status: 400, headers: corsHeaders });
    }

    // If multiple, take the largest by amount (typically the meme token in an LP)
    const transfer = incoming.sort((a, b) => Number(b.tokenAmount) - Number(a.tokenAmount))[0];
    const tokenMint = transfer.mint;
    const quantityTokens = Number(transfer.tokenAmount);

    // Fetch token metadata + price
    const [meta, priceUsd] = await Promise.all([
      fetchTokenMetadata(tokenMint),
      fetchTokenPriceUsd(tokenMint),
    ]);

    if (!priceUsd || priceUsd <= 0) {
      return new Response(JSON.stringify({
        error: 'no_price',
        message: `Could not fetch a USD price for token ${tokenMint}. Cannot create reclaimed position without a synthetic buy price.`,
        token_mint: tokenMint,
      }), { status: 400, headers: corsHeaders });
    }

    const buyAmountUsd = quantityTokens * priceUsd;
    const txTimestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString();

    // Create the synthetic position
    const insertPayload = {
      token_mint: tokenMint,
      token_symbol: meta.symbol,
      token_name: meta.name,
      token_image: meta.image,
      buy_amount_usd: buyAmountUsd,
      buy_price_usd: priceUsd,
      quantity_tokens: quantityTokens,
      buy_signature: signature,           // reuse the LP withdrawal sig as the "buy" sig
      buy_executed_at: txTimestamp,
      target_multiplier: 2,                // safe default — admin can edit
      status: 'holding',
      wallet_id: walletId,
      position_source: 'lp_reclaimed',
      lp_pool_address: pool_address,
      lp_withdrawal_signature: signature,
      created_at: txTimestamp,
    };

    const inserted = await assertInsert<any>(
      supabase.from('flip_positions').insert(insertPayload as any).select().single(),
      'flip_positions'
    );

    return new Response(JSON.stringify({
      ok: true,
      position: inserted,
      summary: {
        token: meta.symbol || tokenMint.slice(0, 6),
        quantity: quantityTokens,
        price_usd: priceUsd,
        reclaimed_value_usd: buyAmountUsd,
        timestamp: txTimestamp,
      },
    }), { status: 200, headers: corsHeaders });

  } catch (e: any) {
    console.error('flipit-lp-reclaim error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), { status: 500, headers: corsHeaders });
  }
});
