/**
 * ath-backfill
 *
 * Fills missing ATH ($ market cap) for tokens in token_lifecycle and pumpfun_watchlist.
 *
 * Source priority:
 *   1. GeckoTerminal /networks/solana/tokens/{mint}/pools  -> max(price_change_percentage * current) extrapolation NOT used.
 *      Instead we hit /networks/solana/pools/{pool}/ohlcv/hour?aggregate=1&limit=1000 to compute true lifetime ATH.
 *   2. DexScreener tokens/v1/solana/{mint} -> uses priceChange.h24 + current as ceiling fallback.
 *
 * Writes back via assertDbWrite to:
 *   - token_lifecycle.ath_24h_usd  (we treat this column as "lifetime ATH" going forward)
 *   - pumpfun_watchlist.price_ath_usd
 *
 * Cron-safe: limit 200 mints per invocation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GT_BASE = 'https://api.geckoterminal.com/api/v2';
const DS_BASE = 'https://api.dexscreener.com';

// GeckoTerminal: 30 req/min unauthenticated -> 2000ms minimum spacing between calls.
let lastGtCallAt = 0;
async function geckoThrottle() {
  const now = Date.now();
  const wait = 2000 - (now - lastGtCallAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGtCallAt = Date.now();
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    if (url.startsWith(GT_BASE)) await geckoThrottle();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'accept': 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Returns the lifetime ATH market cap (USD) for a Solana token mint, or null.
 */
async function geckoTerminalAth(mint: string): Promise<{ athUsd: number; athAt: string | null } | null> {
  // Get the top pool for the token
  const pools = await fetchJson(`${GT_BASE}/networks/solana/tokens/${mint}/pools?page=1`);
  const top = pools?.data?.[0];
  if (!top) return null;
  const poolAddr = top?.attributes?.address;
  const totalSupply = Number(top?.attributes?.base_token_price_usd) > 0
    ? Number(top?.attributes?.market_cap_usd) / Number(top?.attributes?.base_token_price_usd)
    : null;
  if (!poolAddr) return null;

  // Hourly OHLCV — up to 1000 candles (~41 days)
  const ohlcv = await fetchJson(`${GT_BASE}/networks/solana/pools/${poolAddr}/ohlcv/hour?aggregate=1&limit=1000`);
  const list: number[][] = ohlcv?.data?.attributes?.ohlcv_list ?? [];
  if (!list.length) return null;

  // Each row: [timestamp, open, high, low, close, volume]
  let bestHigh = 0;
  let bestTs = 0;
  for (const row of list) {
    const high = Number(row[2]);
    if (high > bestHigh) {
      bestHigh = high;
      bestTs = Number(row[0]);
    }
  }
  if (bestHigh <= 0 || !totalSupply) return null;

  return {
    athUsd: bestHigh * totalSupply,
    athAt: bestTs ? new Date(bestTs * 1000).toISOString() : null,
  };
}

/**
 * DexScreener fallback — derives a *floor* on ATH from priceChange.h24 if positive.
 * This is far less accurate than GeckoTerminal OHLCV but keeps something in the column.
 */
async function dexScreenerAth(mint: string): Promise<{ athUsd: number; athAt: string | null } | null> {
  const data = await fetchJson(`${DS_BASE}/tokens/v1/solana/${mint}`);
  const pair = Array.isArray(data) ? data[0] : data?.pairs?.[0];
  if (!pair) return null;
  const mcap = Number(pair.marketCap ?? pair.fdv ?? 0);
  const change24h = Number(pair?.priceChange?.h24 ?? 0);
  // If 24h change is negative, the price 24h ago was higher → floor estimate
  // ATH is at least mcap / (1 + change24h/100)
  if (mcap > 0 && change24h < 0) {
    const floor = mcap / (1 + change24h / 100);
    return { athUsd: floor, athAt: null };
  }
  if (mcap > 0) return { athUsd: mcap, athAt: null };
  return null;
}

async function resolveAth(mint: string): Promise<{ athUsd: number; athAt: string | null; source: string } | null> {
  const gt = await geckoTerminalAth(mint);
  if (gt && gt.athUsd > 0) return { ...gt, source: 'geckoterminal_ohlcv' };
  const ds = await dexScreenerAth(mint);
  if (ds && ds.athUsd > 0) return { ...ds, source: 'dexscreener_floor' };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 200), 500);

  // Find tokens missing ATH in lifecycle
  const { data: missing, error } = await supabase
    .from('token_lifecycle')
    .select('token_mint')
    .or('ath_24h_usd.is.null,ath_24h_usd.eq.0')
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of missing ?? []) {
    const mint = row.token_mint;
    if (!mint) { skipped++; continue; }
    try {
      const ath = await resolveAth(mint);
      if (!ath) { skipped++; continue; }

      // Write to lifecycle
      await assertDbWrite(
        supabase.from('token_lifecycle')
          .update({ ath_24h_usd: ath.athUsd, updated_at: new Date().toISOString() })
          .eq('token_mint', mint),
        'token_lifecycle', 'UPDATE',
      );

      // Mirror into pumpfun_watchlist if present
      await supabase
        .from('pumpfun_watchlist')
        .update({ price_ath_usd: ath.athUsd })
        .eq('token_mint', mint)
        .is('price_ath_usd', null);

      updated++;
      // Per-call GT pacing handled in fetchJson (2000ms between calls).
    } catch (e) {
      errors.push(`${mint}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({
    success: true, updated, skipped, examined: missing?.length ?? 0, errors: errors.slice(0, 10),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});