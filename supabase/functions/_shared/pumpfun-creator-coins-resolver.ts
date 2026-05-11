/**
 * Pump.fun creator coins resolver — 3-tier chain.
 *
 * Tier 1: Official frontend-api-v3.pump.fun /coins/user-created-coins (existing pumpfunFetch)
 * Tier 2: Browserless scrape of https://pump.fun/profile/{wallet}
 * Tier 3: Apify generic web-scraper (only for "important" wallets, cost-gated)
 *
 * All callers should use this instead of fetchPumpFunCreatorCoins directly when
 * they want fallback resilience. Returns the same { mint, symbol, name,
 * usd_market_cap, complete } shape so existing code is unchanged.
 *
 * A 6h cooldown per wallet is enforced via pumpfun_profile_scrape_log so the
 * 5-min KYC cron + mesh funnel don't re-scrape the same wallet repeatedly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { fetchPumpFunCreatorCoins } from './pumpfun-fetch.ts';
import { scrapeHtml } from './browserless-scraper.ts';

export interface ResolvedCoin {
  mint: string;
  symbol: string;
  name: string;
  usd_market_cap: number;
  complete: boolean;
  _source?: 'api' | 'browserless' | 'apify';
}

export interface ResolveOptions {
  callerName: string;
  /** Max coins to return from API tier (default 200). */
  apiLimit?: number;
  /** Skip Browserless/Apify even if API returns []. Default false. */
  apiOnly?: boolean;
  /** Force-run regardless of cooldown. Used by admin button. */
  bypassCooldown?: boolean;
  /** Allow Apify Tier 3. Default false unless wallet is "important". */
  allowApify?: boolean;
}

export interface ResolveResult {
  coins: ResolvedCoin[];
  tierUsed: 'api' | 'browserless' | 'apify' | 'cache_skip' | 'none';
  elapsedMs: number;
  errors: string[];
}

const COOLDOWN_MS_DEFAULT = 6 * 60 * 60 * 1000;   // 6 h
const COOLDOWN_MS_KYC      = 1 * 60 * 60 * 1000;  // 1 h for KYC-verified
const APIFY_DAILY_CAP      = 50;

function getSb() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Fetch Tier 1 (paginated API). */
async function tierApi(wallet: string, callerName: string, apiLimit: number): Promise<ResolvedCoin[]> {
  const all: ResolvedCoin[] = [];
  const pageSize = 100;
  let offset = 0;
  while (offset < apiLimit) {
    const data = await fetchPumpFunCreatorCoins(wallet, callerName, pageSize, offset);
    if (!data || data.length === 0) break;
    for (const t of data as any[]) {
      if (!t?.mint) continue;
      all.push({
        mint: t.mint,
        symbol: t.symbol || '???',
        name: t.name || 'Unknown',
        usd_market_cap: Number(t.usd_market_cap) || 0,
        complete: t.complete === true,
        _source: 'api',
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/** Tier 2: Browserless scrape of pump.fun profile page. */
async function tierBrowserless(wallet: string): Promise<{ coins: ResolvedCoin[]; error?: string }> {
  const url = `https://pump.fun/profile/${wallet}`;
  // Wait for the coin grid to mount — pump.fun renders it client-side.
  const res = await scrapeHtml(url, { waitMs: 6000 });
  if (!res.success || !res.html) {
    return { coins: [], error: res.error || 'browserless failed' };
  }
  return { coins: parseProfileHtml(res.html) };
}

/** Tier 3: Apify generic web-scraper. */
async function tierApify(wallet: string): Promise<{ coins: ResolvedCoin[]; error?: string }> {
  const apifyKey = Deno.env.get('APIFY_API_KEY');
  if (!apifyKey) return { coins: [], error: 'APIFY_API_KEY missing' };

  const sb = getSb();
  // Daily cap guard
  if (sb) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await sb
        .from('pumpfun_profile_scrape_log')
        .select('wallet_address', { count: 'exact', head: true })
        .eq('source', 'apify')
        .gte('last_scraped_at', since);
      if ((count ?? 0) >= APIFY_DAILY_CAP) {
        return { coins: [], error: `Apify daily cap (${APIFY_DAILY_CAP}) reached` };
      }
    } catch { /* non-fatal */ }
  }

  const profileUrl = `https://pump.fun/profile/${wallet}`;
  const pageFunction = `async function pageFunction(context){
    const { request, page } = context;
    await page.waitForTimeout(6000);
    const html = await page.content();
    return { url: request.url, html };
  }`;

  const actorId = 'apify~web-scraper';
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}&clean=1&timeout=180`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: profileUrl }],
        pageFunction,
        proxyConfiguration: { useApifyProxy: true },
        maxRequestRetries: 1,
        maxPagesPerCrawl: 1,
      }),
    });
    if (!res.ok) return { coins: [], error: `Apify HTTP ${res.status}` };
    const items = await res.json();
    const html = items?.[0]?.html as string | undefined;
    if (!html) return { coins: [], error: 'Apify returned no html' };
    return { coins: parseProfileHtml(html) };
  } catch (e) {
    return { coins: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Parse pump.fun profile HTML for coin entries. Looks for anchors of the form
 * /coin/{mint} and extracts ticker / name / mcap from sibling text. Pump.fun
 * tweaks markup occasionally so we keep this tolerant: anything that looks
 * like a pump-style mint (32-44 base58 chars, ends with 'pump' OR is plausible
 * Solana base58) inside a /coin/ href is captured.
 */
export function parseProfileHtml(html: string): ResolvedCoin[] {
  const out = new Map<string, ResolvedCoin>();
  const hrefRegex = /\/coin\/([1-9A-HJ-NP-Za-km-z]{32,64})/g;
  let m: RegExpExecArray | null;
  while ((m = hrefRegex.exec(html)) !== null) {
    const mint = m[1];
    if (out.has(mint)) continue;
    // Look at a 800-char window around the match for ticker/name/mcap hints
    const start = Math.max(0, m.index - 400);
    const end = Math.min(html.length, m.index + 400);
    const window = html.slice(start, end);
    const ticker = window.match(/\$([A-Za-z0-9_]{2,15})/)?.[1] || '???';
    const nameMatch = window.match(/>([^<>{}]{2,40})<\/(?:span|div|p|h[1-6])>/);
    const name = nameMatch?.[1]?.trim() || ticker;
    // Market cap: "market cap: $1.2K" / "$1,234" / "MC: $12.3K"
    const mcapMatch = window.match(/(?:market\s*cap|MC)[:\s]*\$?([\d.,]+)\s*([KMB])?/i)
      || window.match(/\$([\d.,]+)\s*([KMB])?/i);
    let mcap = 0;
    if (mcapMatch) {
      const n = Number(mcapMatch[1].replace(/,/g, '')) || 0;
      const mult = mcapMatch[2]?.toUpperCase() === 'K' ? 1e3
                 : mcapMatch[2]?.toUpperCase() === 'M' ? 1e6
                 : mcapMatch[2]?.toUpperCase() === 'B' ? 1e9 : 1;
      mcap = n * mult;
    }
    out.set(mint, {
      mint,
      symbol: ticker,
      name,
      usd_market_cap: mcap,
      complete: /graduated|complete/i.test(window),
      _source: 'browserless',
    });
  }
  return Array.from(out.values());
}

/** Check & update the cooldown log. Returns true if we should skip. */
async function shouldSkipCooldown(wallet: string, kycVerified: boolean): Promise<boolean> {
  const sb = getSb();
  if (!sb) return false;
  try {
    const { data } = await sb
      .from('pumpfun_profile_scrape_log')
      .select('last_scraped_at, success')
      .eq('wallet_address', wallet)
      .maybeSingle();
    if (!data?.last_scraped_at) return false;
    const cd = kycVerified ? COOLDOWN_MS_KYC : COOLDOWN_MS_DEFAULT;
    const age = Date.now() - new Date(data.last_scraped_at).getTime();
    return age < cd;
  } catch {
    return false;
  }
}

async function logScrape(
  wallet: string,
  source: 'api' | 'browserless' | 'apify',
  coinsFound: number,
  success: boolean,
  errorMsg?: string,
) {
  const sb = getSb();
  if (!sb) return;
  try {
    await sb.from('pumpfun_profile_scrape_log').upsert({
      wallet_address: wallet,
      source,
      coins_found: coinsFound,
      success,
      last_error: errorMsg ?? null,
      last_scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });
  } catch (e) {
    console.warn('[pumpfun-creator-coins-resolver] log failed:', e);
  }
}

/** Determine if a wallet is "important" enough to justify Apify auto-fallback. */
async function isImportantWallet(wallet: string): Promise<boolean> {
  const sb = getSb();
  if (!sb) return false;
  try {
    const { data } = await sb
      .from('developer_profiles')
      .select('kyc_verified, total_tokens_created')
      .eq('master_wallet_address', wallet)
      .maybeSingle();
    if (!data) return false;
    if (data.kyc_verified === true) return true;
    if ((data.total_tokens_created ?? 0) > 5) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Main entry point. API-only by default; pass `apiOnly: false` to enable
 * Browserless fallback. Apify is gated by `allowApify` AND wallet importance.
 */
export async function resolveCreatorCoins(
  wallet: string,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const apiLimit = opts.apiLimit ?? 200;

  // Tier 1: API
  let coins: ResolvedCoin[] = [];
  try {
    coins = await tierApi(wallet, opts.callerName, apiLimit);
  } catch (e) {
    errors.push(`api: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (coins.length > 0) {
    await logScrape(wallet, 'api', coins.length, true);
    return { coins, tierUsed: 'api', elapsedMs: Date.now() - t0, errors };
  }
  if (opts.apiOnly) {
    return { coins, tierUsed: 'none', elapsedMs: Date.now() - t0, errors };
  }

  // Cooldown gate (only for fallback tiers)
  if (!opts.bypassCooldown) {
    const kyc = await isImportantWallet(wallet);
    if (await shouldSkipCooldown(wallet, kyc)) {
      return { coins: [], tierUsed: 'cache_skip', elapsedMs: Date.now() - t0, errors };
    }
  }

  // Tier 2: Browserless
  if (Deno.env.get('BROWSERLESS_URL') && Deno.env.get('BROWSERLESS_TOKEN')) {
    const r = await tierBrowserless(wallet);
    if (r.error) errors.push(`browserless: ${r.error}`);
    if (r.coins.length > 0) {
      await logScrape(wallet, 'browserless', r.coins.length, true);
      return { coins: r.coins, tierUsed: 'browserless', elapsedMs: Date.now() - t0, errors };
    }
  } else {
    errors.push('browserless: not configured');
  }

  // Tier 3: Apify (gated)
  const importantOk = opts.allowApify ?? await isImportantWallet(wallet);
  if (importantOk) {
    const r = await tierApify(wallet);
    if (r.error) errors.push(`apify: ${r.error}`);
    if (r.coins.length > 0) {
      await logScrape(wallet, 'apify', r.coins.length, true);
      return { coins: r.coins, tierUsed: 'apify', elapsedMs: Date.now() - t0, errors };
    }
  }

  // All tiers failed
  await logScrape(wallet, 'browserless', 0, false, errors.join(' | '));
  return { coins: [], tierUsed: 'none', elapsedMs: Date.now() - t0, errors };
}