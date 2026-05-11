// Shared helpers for first-24h ATH capture (sealer + backfill).
// Pulls hourly OHLCV from GeckoTerminal restricted to the token's first-24h window
// and returns the max USD market cap observed.

const GT_BASE = 'https://api.geckoterminal.com/api/v2';

let lastGtCallAt = 0;
async function geckoThrottle() {
  const now = Date.now();
  const wait = 2100 - (now - lastGtCallAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGtCallAt = Date.now();
}

async function gtFetch(url: string, timeoutMs = 9000): Promise<any | null> {
  await geckoThrottle();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export interface First24hAthResult {
  ath_usd: number | null;
  source: 'geckoterminal_live' | 'geckoterminal_backfill' | 'no_pool';
  pool?: string;
}

/**
 * Fetches the first-24h ATH market cap (USD) for a token using GeckoTerminal hourly OHLCV.
 * @param mint  Solana token mint
 * @param firstSeenAtIso  Token's first_seen_at (ISO string)
 * @param mode  'live' (sealing at ~23h45m) or 'backfill' (historical >24h old)
 */
export async function fetchFirst24hAth(
  mint: string,
  firstSeenAtIso: string,
  mode: 'live' | 'backfill',
): Promise<First24hAthResult> {
  // 1. Find top pool
  const poolsData = await gtFetch(`${GT_BASE}/networks/solana/tokens/${mint}/pools?page=1`);
  const pool = poolsData?.data?.[0]?.attributes?.address;
  if (!pool) {
    return { ath_usd: null, source: 'no_pool' };
  }

  // 2. Compute first-24h window
  const firstSeen = new Date(firstSeenAtIso).getTime();
  const windowEnd = Math.floor((firstSeen + 24 * 3600 * 1000) / 1000); // unix seconds

  // GeckoTerminal: /pools/{pool}/ohlcv/hour?aggregate=1&limit=24&before_timestamp=...&currency=usd
  // before_timestamp returns the 24 candles BEFORE that timestamp.
  const ohlcvUrl = `${GT_BASE}/networks/solana/pools/${pool}/ohlcv/hour?aggregate=1&limit=24&currency=usd&before_timestamp=${windowEnd}`;
  const ohlcvData = await gtFetch(ohlcvUrl);
  const candles: any[] = ohlcvData?.data?.attributes?.ohlcv_list ?? [];
  if (candles.length === 0) {
    return { ath_usd: null, source: 'no_pool', pool };
  }

  // OHLCV row: [timestamp, open, high, low, close, volume]
  // GT returns price candles (USD per token), not mcap. We multiply by total supply via pool meta if needed.
  // Pool meta from poolsData has reserve + token info; the simplest accurate proxy is fdv_usd at the candle's high
  // ratio. We approximate: high_price / current_price * current_fdv_usd.
  const poolAttrs = poolsData.data[0].attributes;
  const currentPrice = Number(poolAttrs.base_token_price_usd) || 0;
  const currentFdv = Number(poolAttrs.fdv_usd) || Number(poolAttrs.market_cap_usd) || 0;

  let maxHighPrice = 0;
  for (const c of candles) {
    const high = Number(c[2]);
    if (Number.isFinite(high) && high > maxHighPrice) maxHighPrice = high;
  }

  if (maxHighPrice <= 0) {
    return { ath_usd: null, source: 'no_pool', pool };
  }

  // Convert peak price to peak mcap using current fdv ratio
  const ath_usd = currentPrice > 0 && currentFdv > 0
    ? (maxHighPrice / currentPrice) * currentFdv
    : 0;

  return {
    ath_usd: ath_usd > 0 ? ath_usd : null,
    source: mode === 'live' ? 'geckoterminal_live' : 'geckoterminal_backfill',
    pool,
  };
}