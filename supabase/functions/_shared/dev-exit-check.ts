/**
 * Dev-Exit Suppression Check
 *
 * Given (tokenMint, devWallet), fetches the dev's CURRENT token balance via
 * Helius getTokenAccountsByOwner and compares against total supply. Returns
 * an exit verdict used by mint-alert pipelines to suppress dead-on-arrival
 * announcements.
 *
 * Suppression rules:
 *   - DEV_DUMPED  → dev holds 0 tokens AND mint age >= 60s
 *   - DEV_EXITED  → dev holds < 0.5% of total supply (sold >= 99.5%)
 *   - clean       → otherwise (do NOT suppress)
 *
 * 1 Helius call per evaluation, cached 30s per (mint,wallet) in-memory.
 * Caller is responsible for gating by tier (e.g. always announce T6+).
 */

import { getHeliusRpcUrl } from './helius-client.ts';

export type DevExitVerdict =
  | { exited: false; reason: null; balancePct: number | null }
  | { exited: true; reason: 'DEV_DUMPED' | 'DEV_EXITED'; balancePct: number };

const EXIT_THRESHOLD_PCT = 0.5;       // <0.5% of supply held => exited
const MIN_MINT_AGE_SEC_FOR_DUMP = 60; // require some age before "0 balance" counts
const CACHE_TTL_MS = 30_000;

const cache = new Map<string, { ts: number; verdict: DevExitVerdict }>();

interface CheckParams {
  tokenMint: string;
  devWallet: string;
  mintTimestampMs: number | null; // ms epoch; null = unknown (treat as old enough)
}

export async function checkDevExit(params: CheckParams): Promise<DevExitVerdict> {
  const { tokenMint, devWallet, mintTimestampMs } = params;
  const cacheKey = `${tokenMint}:${devWallet}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.verdict;

  const rpcUrl = getHeliusRpcUrl();
  let devUiAmount = 0;
  let totalSupply = 0;

  try {
    // 1) dev's balance for this mint
    const accRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
        params: [devWallet, { mint: tokenMint }, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const accJson = await accRes.json();
    const accounts = accJson?.result?.value ?? [];
    for (const a of accounts) {
      const ui = a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof ui === 'number') devUiAmount += ui;
    }

    // 2) total supply
    const supRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'getTokenSupply', params: [tokenMint],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const supJson = await supRes.json();
    totalSupply = supJson?.result?.value?.uiAmount ?? 0;
  } catch (e) {
    console.warn('[dev-exit-check] RPC failed, treating as clean (fail-open):', (e as Error).message);
    const v: DevExitVerdict = { exited: false, reason: null, balancePct: null };
    cache.set(cacheKey, { ts: Date.now(), verdict: v });
    return v;
  }

  if (!totalSupply || totalSupply <= 0) {
    const v: DevExitVerdict = { exited: false, reason: null, balancePct: null };
    cache.set(cacheKey, { ts: Date.now(), verdict: v });
    return v;
  }

  const pct = (devUiAmount / totalSupply) * 100;
  const ageSec = mintTimestampMs ? (Date.now() - mintTimestampMs) / 1000 : Number.POSITIVE_INFINITY;

  let verdict: DevExitVerdict;
  if (devUiAmount === 0 && ageSec >= MIN_MINT_AGE_SEC_FOR_DUMP) {
    verdict = { exited: true, reason: 'DEV_DUMPED', balancePct: 0 };
  } else if (pct < EXIT_THRESHOLD_PCT) {
    verdict = { exited: true, reason: 'DEV_EXITED', balancePct: pct };
  } else {
    verdict = { exited: false, reason: null, balancePct: pct };
  }

  cache.set(cacheKey, { ts: Date.now(), verdict });
  return verdict;
}

/** Tier at/above this number bypasses dev-exit suppression (legends always announce). */
export const SUPPRESS_DEV_EXIT_BELOW_TIER = 6;
