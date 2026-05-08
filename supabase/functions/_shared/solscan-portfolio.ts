/**
 * Solscan Pro v2.0 — Wallet Portfolio Helper
 *
 * Calls /v2.0/account/portfolio to get a wallet's USD-valued holdings.
 * Used by the BubbleMap "Portfolio chip" hover affordance.
 *
 * Caching: in-memory LRU, 5-minute TTL. Bypass with `force: true`.
 * Honors provider-health circuit breaker via the calling site.
 */

const PORTFOLIO_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; value: WalletPortfolio }>();
import { solscanFetch } from "./solscan-rate-limiter.ts";

export interface PortfolioToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  amount: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number;
  icon: string | null;
}

export interface WalletPortfolio {
  wallet: string;
  totalValueUsd: number;
  tokenCount: number;
  topTokens: PortfolioToken[]; // sorted by valueUsd desc, capped to 10
  fetchedAt: string;
  fromCache: boolean;
}

function solscanHeaders(apiKey: string): Record<string, string> {
  return {
    token: apiKey,
    Accept: 'application/json',
    'User-Agent': 'BlackboxFarm/1.0 (+holdersintel)',
  };
}

function pruneCache() {
  if (cache.size < 500) return;
  const cutoff = Date.now() - PORTFOLIO_CACHE_TTL_MS;
  for (const [k, v] of cache.entries()) {
    if (v.ts < cutoff) cache.delete(k);
  }
}

export async function fetchWalletPortfolio(
  wallet: string,
  opts: { force?: boolean; apiErrors?: string[] } = {}
): Promise<WalletPortfolio | null> {
  const { force = false, apiErrors = [] } = opts;
  if (!wallet || wallet.length < 32) return null;

  const now = Date.now();
  const cached = cache.get(wallet);
  if (!force && cached && now - cached.ts < PORTFOLIO_CACHE_TTL_MS) {
    return { ...cached.value, fromCache: true };
  }

  const apiKey = Deno.env.get('SOLSCAN_API_KEY');
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    console.warn('[solscan-portfolio] SOLSCAN_API_KEY missing');
    return null;
  }

  try {
    const url = `https://pro-api.solscan.io/v2.0/account/portfolio?address=${wallet}`;
    const resp = await solscanFetch(url, {
      headers: solscanHeaders(apiKey),
      timeoutMs: 8000,
      cacheTtlMs: 0, // local cache above already memoizes per wallet
    });

    if (!resp.ok) {
      const detail = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body || '');
      apiErrors.push(`Solscan portfolio ${resp.status}: ${detail.slice(0, 200)}`);
      console.warn(`[solscan-portfolio] ${resp.status} for ${wallet.slice(0, 8)}…`);
      return null;
    }

    const json = resp.body;
    const data = json?.data || json;
    const tokens: PortfolioToken[] = (data?.tokens || data?.items || [])
      .map((t: any) => {
        const decimals = Number(t.decimals ?? t.token_decimals ?? 0);
        const rawAmount = Number(t.amount ?? t.balance ?? 0);
        const amount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;
        const priceUsd = t.price_usdt ?? t.price_usd ?? t.price ?? null;
        const valueUsd = t.value ?? t.value_usd ?? (priceUsd != null ? amount * Number(priceUsd) : 0);
        return {
          mint: t.token_address || t.address || t.mint || '',
          symbol: t.token_symbol || t.symbol || null,
          name: t.token_name || t.name || null,
          amount,
          decimals,
          priceUsd: priceUsd != null ? Number(priceUsd) : null,
          valueUsd: Number(valueUsd) || 0,
          icon: t.token_icon || t.icon || null,
        } as PortfolioToken;
      })
      .filter((t: PortfolioToken) => !!t.mint)
      .sort((a: PortfolioToken, b: PortfolioToken) => b.valueUsd - a.valueUsd);

    const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd || 0), 0);

    const portfolio: WalletPortfolio = {
      wallet,
      totalValueUsd,
      tokenCount: tokens.length,
      topTokens: tokens.slice(0, 10),
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };

    cache.set(wallet, { ts: now, value: portfolio });
    pruneCache();
    return portfolio;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    apiErrors.push(`Solscan portfolio error: ${msg}`);
    console.error(`[solscan-portfolio] ${msg}`);
    return null;
  }
}