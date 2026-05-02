/**
 * Unified Launchpad Metadata Fetcher
 *
 * Single entry point for "give me everything the launchpad knows about this mint".
 * Replaces scattered `mint.endsWith('pump')` checks across the codebase.
 *
 * Supported launchpads (current state of public APIs, verified 2026-05):
 *   - Pump.fun     → frontend-api-v3 /coins/{mint} (free, no auth)  ✅ full data
 *   - Bags.fm      → public-api-v2  /token-launch  (x-api-key)      ✅ partial data
 *   - Bonk.fun     → no public REST metadata API                    ❌ null + reason
 *   - Meteora      → no launchpad metadata layer (AMM only)         ❌ null + reason
 *
 * Callers should treat `null` results as "fall through to Helius/DexScreener",
 * NOT as an error. Use the `reason` field for logging only.
 *
 * Extending: when a new launchpad opens up its API (Bonk.fun via Bitquery,
 * Meteora-DBC, etc.) add a fetcher here. Do NOT add launchpad detection
 * logic in caller files — keep it centralized.
 */

import { fetchPumpFunCoin } from './pumpfun-fetch.ts';

export type LaunchpadId = 'pumpfun' | 'bagsfm' | 'bonkfun' | 'meteora' | 'unknown';

export interface LaunchpadCoin {
  launchpad: LaunchpadId;
  mint: string;
  name?: string | null;
  symbol?: string | null;
  description?: string | null;
  imageUri?: string | null;
  creator?: string | null;
  // Socials (any may be null/empty string when missing)
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  discord?: string | null;
  // Market data — null when launchpad doesn't expose it
  marketCapUsd?: number | null;
  athMarketCapUsd?: number | null;
  // Lifecycle
  createdAt?: string | null; // ISO
  status?: string | null;    // PRE_GRAD / GRAD / live / dead
  // Provenance for debugging
  raw?: Record<string, unknown>;
}

export interface LaunchpadFetchResult {
  data: LaunchpadCoin | null;
  launchpad: LaunchpadId;
  reason?: string; // populated when data === null
}

// ── Launchpad detection ─────────────────────────────────────────────
// Cheap, suffix/program-based. We avoid an RPC call here.
export function detectLaunchpad(mint: string): LaunchpadId {
  if (!mint || typeof mint !== 'string') return 'unknown';
  if (mint.endsWith('pump')) return 'pumpfun';
  if (mint.endsWith('BAGS')) return 'bagsfm';
  if (mint.endsWith('BONK') || mint.endsWith('bonk')) return 'bonkfun';
  return 'unknown';
}

// ── Pump.fun adapter ─────────────────────────────────────────────────
async function fetchPumpFun(mint: string, caller: string): Promise<LaunchpadFetchResult> {
  try {
    const d = await fetchPumpFunCoin(mint, caller);
    if (!d) return { data: null, launchpad: 'pumpfun', reason: 'pumpfun_returned_null' };
    return {
      launchpad: 'pumpfun',
      data: {
        launchpad: 'pumpfun',
        mint,
        name: d.name ?? null,
        symbol: d.symbol ?? null,
        description: d.description ?? null,
        imageUri: d.image_uri ?? null,
        creator: d.creator ?? null,
        twitter: d.twitter ?? null,
        telegram: d.telegram ?? null,
        website: d.website ?? null,
        discord: d.discord ?? null,
        marketCapUsd: typeof d.usd_market_cap === 'number' ? d.usd_market_cap : null,
        athMarketCapUsd: typeof d.ath_market_cap === 'number' ? d.ath_market_cap : null,
        createdAt: d.created_timestamp
          ? new Date(d.created_timestamp).toISOString()
          : null,
        status: d.complete ? 'graduated' : 'live',
        raw: d,
      },
    };
  } catch (e) {
    return {
      data: null,
      launchpad: 'pumpfun',
      reason: `pumpfun_error:${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Bags.fm adapter ──────────────────────────────────────────────────
const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

async function fetchIpfsMetadata(uri: string): Promise<any | null> {
  if (!uri) return null;
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBagsFm(mint: string, _caller: string): Promise<LaunchpadFetchResult> {
  const apiKey = Deno.env.get('BAGS_FM_API_KEY');
  if (!apiKey) {
    return { data: null, launchpad: 'bagsfm', reason: 'bagsfm_api_key_missing' };
  }

  // Bags.fm has no direct find-by-mint endpoint. We pull the creator info
  // (which works per-mint) and combine with IPFS metadata from the URI.
  // Limitation: this gives us creator + socials + image, but NOT live
  // marketCap or ATH — those still come from DexScreener downstream.
  try {
    const headers = { 'x-api-key': apiKey, 'Accept': 'application/json' };

    const creatorRes = await fetch(
      `${BAGS_API_BASE}/token-launch/creator/v3?tokenMint=${mint}`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    if (!creatorRes.ok) {
      return {
        data: null,
        launchpad: 'bagsfm',
        reason: `bagsfm_creator_http_${creatorRes.status}`,
      };
    }
    const creatorJson = await creatorRes.json();
    const creators = Array.isArray(creatorJson?.response) ? creatorJson.response : [];
    if (creators.length === 0) {
      return { data: null, launchpad: 'bagsfm', reason: 'bagsfm_no_creators' };
    }
    // Prefer the wallet flagged isCreator, else first
    const primary = creators.find((c: any) => c?.isCreator) || creators[0];
    const creatorWallet: string | null = primary?.wallet ?? null;

    // Pull IPFS metadata for socials + image. Best-effort — null is fine.
    // We don't have the URI here without an extra feed scan, so we accept
    // partial data. If a future Bags.fm endpoint exposes per-mint metadata,
    // wire it in here.
    const ipfs: any = null;
    // (intentionally not scanning the feed — too expensive for a single lookup)

    return {
      launchpad: 'bagsfm',
      data: {
        launchpad: 'bagsfm',
        mint,
        name: ipfs?.name ?? null,
        symbol: ipfs?.symbol ?? null,
        description: ipfs?.description ?? null,
        imageUri: ipfs?.image ?? null,
        creator: creatorWallet,
        twitter: ipfs?.twitter ?? null,
        telegram: ipfs?.telegram ?? null,
        website: ipfs?.website ?? null,
        discord: ipfs?.discord ?? null,
        marketCapUsd: null, // Bags.fm doesn't expose it
        athMarketCapUsd: null,
        createdAt: null,
        status: null,
        raw: { creators, ipfs },
      },
    };
  } catch (e) {
    return {
      data: null,
      launchpad: 'bagsfm',
      reason: `bagsfm_error:${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

/**
 * Bags.fm bulk feed fetcher — useful for discovery / monitoring crons.
 * Returns full LaunchpadCoin entries for the most recent N launches.
 * This is the only Bags.fm endpoint that returns metadata + IPFS uri,
 * so we use it for catch-up scans (not per-mint lookups).
 */
export async function fetchBagsFmFeed(limit = 50): Promise<LaunchpadCoin[]> {
  const apiKey = Deno.env.get('BAGS_FM_API_KEY');
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `${BAGS_API_BASE}/token-launch/feed`,
      { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.response) ? json.response.slice(0, limit) : [];
    const out: LaunchpadCoin[] = [];
    for (const it of items) {
      // Best-effort IPFS hydrate (capped to keep this fast)
      let ipfs: any = null;
      if (it?.uri) ipfs = await fetchIpfsMetadata(it.uri);
      out.push({
        launchpad: 'bagsfm',
        mint: it.tokenMint,
        name: it.name ?? ipfs?.name ?? null,
        symbol: it.symbol ?? ipfs?.symbol ?? null,
        description: ipfs?.description ?? null,
        imageUri: it.image ?? ipfs?.image ?? null,
        creator: null, // creator lives on the /creator/v3 endpoint, not feed
        twitter: it.twitter || ipfs?.twitter || null,
        telegram: ipfs?.telegram ?? null,
        website: it.website || ipfs?.website || null,
        discord: ipfs?.discord ?? null,
        marketCapUsd: null,
        athMarketCapUsd: null,
        createdAt: null,
        status: it.status ?? null,
        raw: it,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Public unified API ───────────────────────────────────────────────
/**
 * Fetch a token's launchpad metadata. Routes to the right adapter
 * based on mint suffix.
 *
 * Returns `null` data with a populated `reason` when:
 *  - the launchpad has no public API (Bonk.fun, Meteora)
 *  - the API returned an error / empty
 *  - the launchpad couldn't be detected
 *
 * Callers should ALWAYS fall through to Helius + DexScreener on null.
 */
export async function fetchLaunchpadCoin(
  mint: string,
  callerName: string,
): Promise<LaunchpadFetchResult> {
  const lp = detectLaunchpad(mint);

  switch (lp) {
    case 'pumpfun':
      return fetchPumpFun(mint, callerName);
    case 'bagsfm':
      return fetchBagsFm(mint, callerName);
    case 'bonkfun':
      return {
        data: null,
        launchpad: 'bonkfun',
        reason: 'bonkfun_no_public_api',
      };
    case 'meteora':
      return {
        data: null,
        launchpad: 'meteora',
        reason: 'meteora_no_metadata_layer',
      };
    default:
      return {
        data: null,
        launchpad: 'unknown',
        reason: 'unknown_launchpad',
      };
  }
}