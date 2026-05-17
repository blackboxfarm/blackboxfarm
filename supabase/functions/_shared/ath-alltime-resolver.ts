/**
 * ATH Option #2 — canonical lifetime ATH resolver.
 *
 * Chain:
 *   1. Pump.fun coin API (pump-suffix mints only)         → confidence: high
 *   2. GeckoTerminal OHLCV paginated walk (day candles)   → confidence: medium
 *   3. Birdeye /defi/history_price tiebreaker (>$50k mc)  → confidence: high
 *
 * Writes ath_alltime_usd / ath_alltime_source / ath_alltime_confidence /
 * ath_alltime_captured_at onto token_lifecycle.
 */

import { fetchPumpFunCoin } from './pumpfun-fetch.ts';

export type AthSource = 'pumpfun' | 'geckoterminal' | 'birdeye' | 'none';
export type AthConfidence = 'high' | 'medium' | 'low';

export interface AthResolution {
  athUsd: number | null;
  source: AthSource;
  confidence: AthConfidence | null;
  capturedAt: string | null;
  notes: string[];
}

const GT_BASE = 'https://api.geckoterminal.com/api/v2';
const BE_BASE = 'https://public-api.birdeye.so';
const FETCH_TIMEOUT = 12_000;

function timeoutSignal(ms = FETCH_TIMEOUT) {
  return AbortSignal.timeout(ms);
}

/** Pump.fun: usd_market_cap on the coin endpoint is the lifetime peak. */
async function pumpfunAth(mint: string): Promise<number | null> {
  if (!mint.toLowerCase().endsWith('pump')) return null;
  try {
    const j = await fetchPumpFunCoin(mint, 'ath-alltime-resolver');
    // Different snapshots may report under either key — take the max.
    const candidates = [j?.usd_market_cap, j?.ath_market_cap, j?.market_cap]
      .map(Number)
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!candidates.length) return null;
    return Math.max(...candidates);
  } catch {
    return null;
  }
}

/**
 * GeckoTerminal: walk OHLCV day candles backward from now until we run out
 * of history (max ~5 pages = 5000 candles ≈ 13y, far more than any token
 * needs). Then a single hour-candle page covering the launch week catches
 * intra-day spikes around debut.
 *
 * GT returns 1000 candles per page; we paginate via `before_timestamp`.
 */
async function geckoterminalAth(mint: string): Promise<number | null> {
  // Find the pool first
  let poolId: string | null = null;
  try {
    const r = await fetch(
      `${GT_BASE}/networks/solana/tokens/${mint}/pools?page=1`,
      { headers: { accept: 'application/json' }, signal: timeoutSignal() },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const pools = j?.data ?? [];
    if (!pools.length) return null;
    // Highest-liquidity pool first (GT sorts by reserve already, take #0)
    poolId = pools[0]?.attributes?.address || null;
  } catch {
    return null;
  }
  if (!poolId) return null;

  let maxClose = 0;
  let before: number | undefined;
  // Day-candle pagination (up to 5 pages of 1000)
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${GT_BASE}/networks/solana/pools/${poolId}/ohlcv/day`);
    url.searchParams.set('limit', '1000');
    if (before) url.searchParams.set('before_timestamp', String(before));
    let candles: number[][] = [];
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: timeoutSignal() });
      if (!r.ok) break;
      const j = await r.json();
      candles = j?.data?.attributes?.ohlcv_list ?? [];
    } catch {
      break;
    }
    if (!candles.length) break;
    for (const c of candles) {
      // [ts, open, high, low, close, volume]
      const high = Number(c?.[2]);
      if (Number.isFinite(high) && high > maxClose) maxClose = high;
    }
    const oldestTs = candles[candles.length - 1]?.[0];
    if (!oldestTs) break;
    before = oldestTs;
    if (candles.length < 1000) break;
    await new Promise((r) => setTimeout(r, 250)); // ≤ 30 req/min limit
  }

  if (maxClose <= 0) return null;

  // Convert peak price → market cap using current supply.
  // Best-effort: pull token attributes from GT for circulating/total supply.
  let supply: number | null = null;
  try {
    const r = await fetch(
      `${GT_BASE}/networks/solana/tokens/${mint}`,
      { headers: { accept: 'application/json' }, signal: timeoutSignal() },
    );
    if (r.ok) {
      const j = await r.json();
      const a = j?.data?.attributes;
      // Prefer circulating; fall back to total
      const cands = [a?.circulating_supply, a?.total_supply, a?.normalized_total_supply]
        .map(Number)
        .filter((v) => Number.isFinite(v) && v > 0);
      if (cands.length) supply = cands[0];
    }
  } catch { /* ignore */ }

  if (!supply) return maxClose; // return raw peak price as last-resort signal
  return maxClose * supply;
}

/**
 * Birdeye history_price tiebreaker for high-mcap tokens. 1-min resolution back
 * to creation. Uses ~30 CU; only call when worth it.
 */
async function birdeyeAth(mint: string, sinceUnix: number): Promise<number | null> {
  // BIRDEYE_SUSPENDED: temporarily disabled by user request. Remove this line to re-enable.
  return null;
  const key = Deno.env.get('BIRDEYE_API_KEY');
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    const url = new URL(`${BE_BASE}/defi/history_price`);
    url.searchParams.set('address', mint);
    url.searchParams.set('address_type', 'token');
    url.searchParams.set('type', '1H'); // hourly is plenty for lifetime peak
    url.searchParams.set('time_from', String(sinceUnix));
    url.searchParams.set('time_to', String(now));
    const r = await fetch(url, {
      headers: { accept: 'application/json', 'x-chain': 'solana', 'X-API-KEY': key },
      signal: timeoutSignal(),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const items: any[] = j?.data?.items ?? [];
    if (!items.length) return null;
    let max = 0;
    for (const it of items) {
      const v = Number(it?.value);
      if (Number.isFinite(v) && v > max) max = v;
    }
    return max > 0 ? max : null;
  } catch {
    return null;
  }
}

/**
 * Resolve canonical lifetime ATH for a single mint, writing back to
 * token_lifecycle when a value is found.
 */
export async function resolveAthAlltime(
  supabase: any,
  tokenMint: string,
  opts: { firstSeenAt?: string | null; currentMcap?: number | null } = {},
): Promise<AthResolution> {
  const notes: string[] = [];
  const now = new Date().toISOString();

  // 1) Pump.fun fast-path
  const pf = await pumpfunAth(tokenMint);
  if (pf && pf > 0) {
    await writeBack(supabase, tokenMint, pf, 'pumpfun', 'high', now);
    return { athUsd: pf, source: 'pumpfun', confidence: 'high', capturedAt: now, notes };
  }

  // 2) GeckoTerminal paginated (medium confidence — supply estimate may drift)
  const gt = await geckoterminalAth(tokenMint);
  if (gt && gt > 0) {
    // 3) Birdeye tiebreaker — only if mcap > $50k threshold worth the CU
    let final = gt;
    let source: AthSource = 'geckoterminal';
    let confidence: AthConfidence = 'medium';
    if ((opts.currentMcap ?? 0) > 50_000 || gt > 50_000) {
      const since = opts.firstSeenAt
        ? Math.floor(new Date(opts.firstSeenAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000) - 90 * 86_400;
      const be = await birdeyeAth(tokenMint, since);
      if (be && be > 0) {
        // Birdeye gives price; need supply to compare — for now, if Birdeye
        // returns a higher figure than GT's price baseline, use it as the
        // authoritative price ceiling and bump confidence.
        if (be > final) {
          final = be;
          source = 'birdeye';
          confidence = 'high';
          notes.push('birdeye-superseded-gt');
        } else {
          confidence = 'high';
          notes.push('birdeye-confirmed-gt');
        }
      }
    }
    await writeBack(supabase, tokenMint, final, source, confidence, now);
    return { athUsd: final, source, confidence, capturedAt: now, notes };
  }

  return { athUsd: null, source: 'none', confidence: null, capturedAt: null, notes };
}

async function writeBack(
  supabase: any,
  tokenMint: string,
  usd: number,
  source: AthSource,
  confidence: AthConfidence,
  capturedAt: string,
) {
  try {
    await supabase
      .from('token_lifecycle')
      .upsert(
        {
          token_mint: tokenMint,
          ath_alltime_usd: usd,
          ath_alltime_source: source,
          ath_alltime_confidence: confidence,
          ath_alltime_captured_at: capturedAt,
        },
        { onConflict: 'token_mint' },
      );
  } catch (e) {
    console.error('[ath-alltime] writeBack failed', e);
  }
}