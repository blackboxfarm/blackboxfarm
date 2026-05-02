/**
 * Weak-Theme Copycat Detector
 *
 * Given a creator wallet, analyzes their Pump.fun launch history and flags
 * developers who repeatedly ship variations of the same theme, all of which
 * fail to gain traction. The classic "uncle/UNC slang riff #7" pattern that
 * triggered this work.
 *
 * Signals we extract:
 *   - theme cluster: ≥3 tokens whose names/symbols share a common token
 *     (bigram or normalized stem) launched within a recency window
 *   - failure rate: % of historic tokens with ATH mcap < $50k
 *   - cadence: launches per week (high cadence + low ATH = farming)
 *
 * Output verdicts:
 *   - `weak_theme_copycat`  cluster ≥3, failure rate ≥70%, ATH median < $50k
 *   - `low_effort_serial`   no cluster but failure rate ≥80% on ≥4 tokens
 *   - `mixed_history`       some hits + some misses
 *   - `clean`               <3 prior tokens or strong track record
 *
 * Caller surfaces this on /holders + /bubblemap pre-scan as a cautionary
 * banner: "This dev has shipped 5 'UNC' variants in 11 days, none above $30k."
 */

import { fetchPumpFunCreatorCoins } from './pumpfun-fetch.ts';

export interface CopycatTokenSummary {
  mint: string;
  name: string | null;
  symbol: string | null;
  athMcapUsd: number;
  createdAt: string | null;
}

export interface CopycatCluster {
  /** the shared token (e.g. "UNC", "PEPE") */
  theme: string;
  members: CopycatTokenSummary[];
}

export interface CopycatVerdict {
  creator: string;
  totalPriorTokens: number;
  clusters: CopycatCluster[];
  failureRate: number;          // 0..1, fraction with ATH < $50k
  medianAthUsd: number;
  launchesLast30d: number;
  verdict: 'weak_theme_copycat' | 'low_effort_serial' | 'mixed_history' | 'clean' | 'insufficient_history';
  cautionMessage: string | null; // human-readable line for UI
}

const FAILURE_FLOOR_USD = 50_000;
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'on', 'in', 'sol', 'solana',
  'coin', 'token', 'inu', 'pump', 'meme', 'official', 'real', 'true',
  '2', '3', 'v2', 'v3', 'ii', 'iii',
]);

function normalizeTokens(s: string | null): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Find shared themes across tokens. A theme is a normalized word that
 * appears in the name or symbol of ≥3 launches.
 */
function findClusters(tokens: CopycatTokenSummary[]): CopycatCluster[] {
  const themeMap = new Map<string, CopycatTokenSummary[]>();
  for (const t of tokens) {
    const words = new Set([...normalizeTokens(t.name), ...normalizeTokens(t.symbol)]);
    for (const w of words) {
      if (!themeMap.has(w)) themeMap.set(w, []);
      themeMap.get(w)!.push(t);
    }
  }
  const clusters: CopycatCluster[] = [];
  for (const [theme, members] of themeMap.entries()) {
    if (members.length >= 3) clusters.push({ theme, members });
  }
  // De-dupe overlapping clusters (prefer the largest)
  clusters.sort((a, b) => b.members.length - a.members.length);
  const usedMints = new Set<string>();
  const dedup: CopycatCluster[] = [];
  for (const c of clusters) {
    const fresh = c.members.filter(m => !usedMints.has(m.mint));
    if (fresh.length >= 3) {
      dedup.push({ theme: c.theme, members: fresh });
      fresh.forEach(m => usedMints.add(m.mint));
    }
  }
  return dedup;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Run the copycat analysis for a creator wallet.
 * Excludes the currently-investigated mint from the analysis if provided.
 */
export async function detectCopycatPattern(
  creatorWallet: string,
  callerName: string,
  excludeMint?: string,
): Promise<CopycatVerdict> {
  const coins = await fetchPumpFunCreatorCoins(creatorWallet, callerName, 100, 0);
  const all: CopycatTokenSummary[] = (coins ?? [])
    .filter((c: any) => c?.mint && (!excludeMint || c.mint !== excludeMint))
    .map((c: any) => ({
      mint: c.mint,
      name: c.name ?? null,
      symbol: c.symbol ?? null,
      athMcapUsd: typeof c.ath_market_cap === 'number' ? c.ath_market_cap : 0,
      createdAt: c.created_timestamp ? new Date(c.created_timestamp).toISOString() : null,
    }));

  if (all.length < 3) {
    return {
      creator: creatorWallet,
      totalPriorTokens: all.length,
      clusters: [],
      failureRate: 0,
      medianAthUsd: 0,
      launchesLast30d: 0,
      verdict: 'insufficient_history',
      cautionMessage: null,
    };
  }

  const failures = all.filter(t => t.athMcapUsd < FAILURE_FLOOR_USD).length;
  const failureRate = failures / all.length;
  const medianAthUsd = median(all.map(t => t.athMcapUsd));

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const launchesLast30d = all.filter(t => t.createdAt && new Date(t.createdAt).getTime() > cutoff).length;

  const clusters = findClusters(all);

  // Verdict
  let verdict: CopycatVerdict['verdict'] = 'mixed_history';
  let cautionMessage: string | null = null;

  const hasStrongCluster = clusters.some(c => c.members.length >= 3);
  if (hasStrongCluster && failureRate >= 0.7 && medianAthUsd < FAILURE_FLOOR_USD) {
    verdict = 'weak_theme_copycat';
    const top = clusters[0];
    cautionMessage =
      `Dev has shipped ${top.members.length} "${top.theme.toUpperCase()}" variants. ` +
      `${Math.round(failureRate * 100)}% peaked under $${FAILURE_FLOOR_USD / 1000}k mcap. ` +
      `Looks like weak-effort theme copycat farming.`;
  } else if (!hasStrongCluster && failureRate >= 0.8 && all.length >= 4) {
    verdict = 'low_effort_serial';
    cautionMessage =
      `Dev has launched ${all.length} prior tokens, ${Math.round(failureRate * 100)}% peaked ` +
      `under $${FAILURE_FLOOR_USD / 1000}k mcap. Serial low-effort launcher.`;
  } else if (failureRate < 0.4 || medianAthUsd >= 100_000) {
    verdict = 'clean';
  }

  return {
    creator: creatorWallet,
    totalPriorTokens: all.length,
    clusters,
    failureRate,
    medianAthUsd,
    launchesLast30d,
    verdict,
    cautionMessage,
  };
}