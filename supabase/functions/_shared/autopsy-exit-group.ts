/**
 * autopsy-exit-group
 *
 * Identify the wallets that ACTUALLY pulled the plug — the sellers whose
 * dumps caused the chart collapse — then prove (or disprove) their link
 * to the dev, the dev's wallet family/KYC root, or the launch snipers.
 *
 * Pure forensics: Helius pair signatures + per-tx token-balance deltas.
 * No AI. Bounded Helius spend.
 *
 * Output is consumed by autopsy-tx-timeline (persisted to autopsy_tx_evidence)
 * and rendered in the autopsy markdown by autopsy-writer.
 */

import { heliusRpcFetch } from './helius-client.ts';
import { discoverFunding } from './funding-resolver.ts';
import { isCexWallet, getCexName } from './cex-wallets.ts';

const LAMPORTS_PER_SOL = 1_000_000_000;

export type AcquisitionMode =
  | 'launch_sniper'
  | 'curve_buyer'
  | 'airdrop_from_dev'
  | 'transfer_from_cluster'
  | 'open_market'
  | 'unknown';

export type ExitBucket =
  | 'dev'
  | 'kyc_root'
  | 'dev_family'
  | 'launch_sniper'
  | 'shared_funder'
  | 'cex_funded'
  | 'independent'
  | 'unknown';

export interface ExitWallet {
  wallet: string;
  sells_count: number;
  sol_received: number;
  first_sell_at: string | null;
  last_sell_at: string | null;
  pct_of_window_volume: number;
  acquisition: {
    mode: AcquisitionMode;
    acquired_at: string | null;
    acquired_tx: string | null;
    source_wallet: string | null;
  };
  funder: { wallet: string | null; label: string | null; is_cex: boolean };
  linkage: {
    is_dev: boolean;
    is_kyc_root: boolean;
    is_in_dev_family: boolean;
    is_launch_sniper: boolean;
    shares_funder_with_dev: boolean;
    shares_funder_with_other_exiters: boolean;
  };
  bucket: ExitBucket;
  linkage_score: number;
}

export interface ExitGroupResult {
  exit_group: ExitWallet[];
  exit_pattern: 'single_dump' | 'sequential_burst' | 'slow_bleed' | 'staircase' | 'mixed' | 'none';
  collapse_window: {
    start: string | null;
    end: string | null;
    duration_sec: number;
    sol_extracted: number;
    seller_count: number;
    tx_count: number;
  } | null;
  exit_group_linkage_summary: {
    dev_funded_pct: number;
    cluster_funded_pct: number;
    launch_sniper_overlap_pct: number;
    same_funder_pct: number;
    independent_pct: number;
  };
  exit_verdict:
    | 'pre_planned_exit'
    | 'coordinated_dump'
    | 'opportunistic_dump'
    | 'organic_distribution'
    | 'insufficient_data';
  notes: string[];
}

const EMPTY: ExitGroupResult = {
  exit_group: [],
  exit_pattern: 'none',
  collapse_window: null,
  exit_group_linkage_summary: {
    dev_funded_pct: 0, cluster_funded_pct: 0, launch_sniper_overlap_pct: 0,
    same_funder_pct: 0, independent_pct: 0,
  },
  exit_verdict: 'insufficient_data',
  notes: [],
};

/**
 * Pull recent signatures for a pair address (oldest-last), then fetch parsed
 * txs and extract per-wallet sell rows for the target mint.
 * Caps Helius spend.
 */
async function collectPairSells(opts: {
  pairAddress: string;
  mint: string;
  maxSigs: number;
  maxTxFetches: number;
}): Promise<Array<{
  wallet: string;
  sig: string;
  ts: string | null;
  block_time: number | null;
  tokens_sold: number;
  sol_received: number;
}>> {
  const out: Array<any> = [];
  const sigsRes = await heliusRpcFetch('getSignaturesForAddress', [
    opts.pairAddress, { limit: Math.min(1000, opts.maxSigs) },
  ]).catch(() => null);
  const sigs: Array<{ signature: string; blockTime: number | null }> = sigsRes?.result ?? [];
  if (sigs.length === 0) return out;

  let fetched = 0;
  for (const s of sigs) {
    if (fetched >= opts.maxTxFetches) break;
    fetched++;
    const txRes = await heliusRpcFetch('getTransaction', [
      s.signature,
      { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
    ]).catch(() => null);
    const tx = txRes?.result;
    if (!tx || tx.meta?.err) continue;

    const accountKeys: string[] = (tx.transaction?.message?.accountKeys ?? [])
      .map((k: any) => typeof k === 'string' ? k : (k?.pubkey ?? ''));

    // Per-owner token delta for this mint
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const preMap = new Map<number, any>();
    for (const b of pre) preMap.set(b.accountIndex, b);
    const ownerTokenDelta = new Map<string, number>();
    for (const p of post) {
      if (p.mint !== opts.mint) continue;
      const owner = p.owner; if (!owner) continue;
      const postUi = Number(p.uiTokenAmount?.uiAmount ?? 0);
      const preB = preMap.get(p.accountIndex);
      const preUi = Number(preB?.uiTokenAmount?.uiAmount ?? 0);
      ownerTokenDelta.set(owner, (ownerTokenDelta.get(owner) ?? 0) + (postUi - preUi));
    }
    // Owners present pre but not post (account closed): treat as full sell
    for (const b of pre) {
      if (b.mint !== opts.mint) continue;
      const owner = b.owner; if (!owner) continue;
      if (!ownerTokenDelta.has(owner)) {
        const preUi = Number(b.uiTokenAmount?.uiAmount ?? 0);
        if (preUi > 0) ownerTokenDelta.set(owner, -preUi);
      }
    }

    // Per-owner SOL delta
    const ownerSolDelta = new Map<string, number>();
    for (let i = 0; i < accountKeys.length; i++) {
      const owner = accountKeys[i];
      const preBal = tx.meta?.preBalances?.[i] ?? 0;
      const postBal = tx.meta?.postBalances?.[i] ?? 0;
      ownerSolDelta.set(owner, (postBal - preBal) / LAMPORTS_PER_SOL);
    }

    for (const [owner, tokenDelta] of ownerTokenDelta.entries()) {
      if (tokenDelta < 0) {
        const tokensSold = Math.abs(tokenDelta);
        const solDelta = ownerSolDelta.get(owner) ?? 0;
        const solReceived = solDelta > 0 ? solDelta : 0;
        out.push({
          wallet: owner,
          sig: s.signature,
          ts: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
          block_time: s.blockTime ?? null,
          tokens_sold: tokensSold,
          sol_received: solReceived,
        });
      }
    }
  }
  return out;
}

function detectCollapseWindow(
  sells: Array<{ block_time: number | null; sol_received: number }>,
): { startBt: number; endBt: number } | null {
  const ts = sells.filter(s => s.block_time && s.sol_received > 0)
    .sort((a, b) => (a.block_time! - b.block_time!));
  if (ts.length < 2) return null;
  const totalSol = ts.reduce((a, b) => a + b.sol_received, 0);
  if (totalSol <= 0) return null;

  // Slide a window across event indices; pick the contiguous run of events that
  // captures the largest share of total SOL within ≤ 30 minutes.
  const WINDOW_SEC = 30 * 60;
  let best = { start: 0, end: 0, sum: 0 };
  for (let i = 0; i < ts.length; i++) {
    let sum = 0; let j = i;
    while (j < ts.length && (ts[j].block_time! - ts[i].block_time!) <= WINDOW_SEC) {
      sum += ts[j].sol_received; j++;
    }
    if (sum > best.sum) {
      best = { start: ts[i].block_time!, end: ts[j - 1].block_time!, sum };
    }
  }
  // Require window to capture ≥ 40% of all sell SOL to count as a "collapse"
  if (best.sum / totalSol < 0.4) return null;
  return { startBt: best.start, endBt: best.end };
}

function classifyPattern(rows: Array<{ block_time: number | null; sol_received: number; wallet: string }>):
  ExitGroupResult['exit_pattern'] {
  if (rows.length === 0) return 'none';
  const sorted = rows.slice().sort((a, b) => (a.block_time! - b.block_time!));
  const distinctWallets = new Set(sorted.map(r => r.wallet));
  const span = (sorted[sorted.length - 1].block_time! - sorted[0].block_time!);
  const totalSol = sorted.reduce((a, b) => a + b.sol_received, 0);
  const topWalletSol = (() => {
    const m = new Map<string, number>();
    for (const r of sorted) m.set(r.wallet, (m.get(r.wallet) ?? 0) + r.sol_received);
    return Math.max(...Array.from(m.values()));
  })();

  if (distinctWallets.size === 1) return 'single_dump';
  if (totalSol > 0 && topWalletSol / totalSol >= 0.7) return 'single_dump';
  if (span <= 60 && distinctWallets.size >= 3) return 'sequential_burst';
  if (span >= 30 * 60 && distinctWallets.size >= 5) return 'slow_bleed';
  if (distinctWallets.size >= 3) return 'staircase';
  return 'mixed';
}

/**
 * For a single exit wallet, determine HOW they acquired the mint.
 * Bounded: 1 Helius call (sigs) + up to 1 tx fetch.
 */
async function traceAcquisition(opts: {
  wallet: string;
  mint: string;
  devWallet: string;
  clusterSet: Set<string>;
  launchSnipersSet: Set<string>;
  launchTxSig: string | null;
}): Promise<ExitWallet['acquisition']> {
  const out: ExitWallet['acquisition'] = {
    mode: 'unknown', acquired_at: null, acquired_tx: null, source_wallet: null,
  };

  if (opts.launchSnipersSet.has(opts.wallet)) {
    out.mode = 'launch_sniper';
    out.acquired_tx = opts.launchTxSig;
    return out;
  }

  const sigsRes = await heliusRpcFetch('getSignaturesForAddress', [
    opts.wallet, { limit: 1000 },
  ]).catch(() => null);
  const sigs: Array<{ signature: string; blockTime: number | null }> = sigsRes?.result ?? [];
  if (sigs.length === 0) return out;
  const ordered = [...sigs].sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

  // Cap to first 6 candidate txs to find the first inbound mint transfer.
  for (const s of ordered.slice(0, 6)) {
    const txRes = await heliusRpcFetch('getTransaction', [
      s.signature,
      { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
    ]).catch(() => null);
    const tx = txRes?.result;
    if (!tx) continue;

    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const preForOwner = pre.filter((b: any) => b.mint === opts.mint && b.owner === opts.wallet);
    const postForOwner = post.filter((b: any) => b.mint === opts.mint && b.owner === opts.wallet);
    const preAmt = preForOwner.reduce((a: number, b: any) => a + Number(b.uiTokenAmount?.uiAmount ?? 0), 0);
    const postAmt = postForOwner.reduce((a: number, b: any) => a + Number(b.uiTokenAmount?.uiAmount ?? 0), 0);
    if (postAmt - preAmt <= 0) continue;

    out.acquired_tx = s.signature;
    out.acquired_at = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null;

    // Identify any wallet that LOST mint tokens in the same tx (the source)
    const sources: string[] = [];
    const preMap = new Map<number, any>();
    for (const b of pre) preMap.set(b.accountIndex, b);
    const ownerDelta = new Map<string, number>();
    for (const p of post) {
      if (p.mint !== opts.mint) continue;
      const owner = p.owner; if (!owner) continue;
      const postUi = Number(p.uiTokenAmount?.uiAmount ?? 0);
      const preB = preMap.get(p.accountIndex);
      const preUi = Number(preB?.uiTokenAmount?.uiAmount ?? 0);
      ownerDelta.set(owner, (ownerDelta.get(owner) ?? 0) + (postUi - preUi));
    }
    for (const [owner, delta] of ownerDelta.entries()) {
      if (owner !== opts.wallet && delta < 0) sources.push(owner);
    }
    out.source_wallet = sources[0] ?? null;

    if (out.source_wallet === opts.devWallet) {
      out.mode = 'airdrop_from_dev'; return out;
    }
    if (out.source_wallet && opts.clusterSet.has(out.source_wallet)) {
      out.mode = 'transfer_from_cluster'; return out;
    }
    // No direct transfer source ⇒ acquired from a pool (curve or AMM)
    out.mode = sources.length === 0 ? 'curve_buyer' : 'open_market';
    return out;
  }
  return out;
}

export async function traceExitGroup(opts: {
  mint: string;
  pairAddress: string | null;
  devWallet: string;
  kycRoot?: string | null;
  clusterWallets?: string[];
  launchSnipers?: string[];
  launchTxSig?: string | null;
  budget?: { maxSigs?: number; maxTxFetches?: number; maxExitWallets?: number };
}): Promise<ExitGroupResult> {
  const notes: string[] = [];
  if (!opts.pairAddress) {
    return { ...EMPTY, notes: ['no pair address available — exit-group trace skipped'] };
  }
  const budget = {
    maxSigs: opts.budget?.maxSigs ?? 1000,
    maxTxFetches: opts.budget?.maxTxFetches ?? 60,
    maxExitWallets: opts.budget?.maxExitWallets ?? 12,
  };

  const clusterSet = new Set<string>([
    opts.devWallet, ...(opts.kycRoot ? [opts.kycRoot] : []), ...(opts.clusterWallets ?? []),
  ]);
  const launchSnipersSet = new Set<string>(opts.launchSnipers ?? []);

  const sells = await collectPairSells({
    pairAddress: opts.pairAddress, mint: opts.mint,
    maxSigs: budget.maxSigs, maxTxFetches: budget.maxTxFetches,
  });
  if (sells.length === 0) {
    return { ...EMPTY, notes: ['no sells decoded against pair address'] };
  }

  const window = detectCollapseWindow(sells);
  let windowSells = sells;
  if (window) {
    windowSells = sells.filter(s =>
      s.block_time !== null && s.block_time >= window.startBt && s.block_time <= window.endBt
    );
  } else {
    notes.push('no clear collapse window detected — analysing all observed sells');
  }

  // Aggregate per wallet within window
  const perWallet = new Map<string, {
    sells_count: number; sol_received: number; tokens_sold: number;
    first_bt: number | null; last_bt: number | null;
  }>();
  for (const s of windowSells) {
    const cur = perWallet.get(s.wallet) ?? {
      sells_count: 0, sol_received: 0, tokens_sold: 0, first_bt: null, last_bt: null,
    };
    cur.sells_count++;
    cur.sol_received += s.sol_received;
    cur.tokens_sold += s.tokens_sold;
    if (s.block_time !== null) {
      cur.first_bt = cur.first_bt === null ? s.block_time : Math.min(cur.first_bt, s.block_time);
      cur.last_bt = cur.last_bt === null ? s.block_time : Math.max(cur.last_bt, s.block_time);
    }
    perWallet.set(s.wallet, cur);
  }

  const totalSol = Array.from(perWallet.values()).reduce((a, b) => a + b.sol_received, 0);
  const ranked = Array.from(perWallet.entries())
    .map(([wallet, v]) => ({ wallet, ...v }))
    .sort((a, b) => b.sol_received - a.sol_received);

  // Top N by SOL OR until 80% cumulative coverage
  const topExits: typeof ranked = [];
  let cum = 0;
  for (const r of ranked) {
    if (topExits.length >= budget.maxExitWallets) break;
    topExits.push(r);
    cum += r.sol_received;
    if (totalSol > 0 && cum / totalSol >= 0.8 && topExits.length >= 3) break;
  }

  // Resolve funder + acquisition per top exit (bounded)
  const exitWallets: ExitWallet[] = [];
  const funderHits = new Map<string, number>();
  let devFunder: string | null = null;
  try {
    const f = await discoverFunding(opts.devWallet);
    devFunder = f?.funder ?? null;
  } catch { /* ignore */ }

  for (const r of topExits) {
    let funder: string | null = null;
    let funderLabel: string | null = null;
    let funderIsCex = false;
    try {
      const f = await discoverFunding(r.wallet);
      funder = f?.funder ?? null;
      funderLabel = f?.funderName ?? f?.funderType ?? null;
      funderIsCex = !!f?.isCex;
      if (funder && isCexWallet(funder)) {
        funderIsCex = true;
        funderLabel = funderLabel ?? getCexName(funder);
      }
    } catch { /* ignore */ }
    if (funder) funderHits.set(funder, (funderHits.get(funder) ?? 0) + 1);

    const acquisition = await traceAcquisition({
      wallet: r.wallet, mint: opts.mint, devWallet: opts.devWallet,
      clusterSet, launchSnipersSet, launchTxSig: opts.launchTxSig ?? null,
    });

    exitWallets.push({
      wallet: r.wallet,
      sells_count: r.sells_count,
      sol_received: r.sol_received,
      first_sell_at: r.first_bt ? new Date(r.first_bt * 1000).toISOString() : null,
      last_sell_at: r.last_bt ? new Date(r.last_bt * 1000).toISOString() : null,
      pct_of_window_volume: totalSol > 0 ? (r.sol_received / totalSol) * 100 : 0,
      acquisition,
      funder: { wallet: funder, label: funderLabel, is_cex: funderIsCex },
      linkage: {
        is_dev: r.wallet === opts.devWallet,
        is_kyc_root: !!opts.kycRoot && r.wallet === opts.kycRoot,
        is_in_dev_family: clusterSet.has(r.wallet),
        is_launch_sniper: launchSnipersSet.has(r.wallet),
        shares_funder_with_dev: !!funder && !!devFunder && funder === devFunder,
        shares_funder_with_other_exiters: false, // filled in below
      },
      bucket: 'unknown',
      linkage_score: 0,
    });
  }

  // Pass 2: shared-funder + bucket + score
  for (const w of exitWallets) {
    if (w.funder.wallet && (funderHits.get(w.funder.wallet) ?? 0) > 1) {
      w.linkage.shares_funder_with_other_exiters = true;
    }
    let score = 0;
    let bucket: ExitBucket = 'independent';
    if (w.linkage.is_dev) { bucket = 'dev'; score = 100; }
    else if (w.linkage.is_kyc_root) { bucket = 'kyc_root'; score = 100; }
    else if (w.linkage.is_in_dev_family) { bucket = 'dev_family'; score = 95; }
    else if (w.linkage.is_launch_sniper) { bucket = 'launch_sniper'; score = 85; }
    else if (w.acquisition.mode === 'airdrop_from_dev' || w.acquisition.mode === 'transfer_from_cluster') {
      bucket = 'dev_family'; score = 90;
    } else if (w.linkage.shares_funder_with_dev) { bucket = 'shared_funder'; score = 80; }
    else if (w.linkage.shares_funder_with_other_exiters) { bucket = 'shared_funder'; score = 65; }
    else if (w.funder.is_cex) { bucket = 'cex_funded'; score = 10; }
    else if (w.funder.wallet) { bucket = 'independent'; score = 5; }
    else { bucket = 'unknown'; score = 0; }
    w.bucket = bucket;
    w.linkage_score = score;
  }

  // Linkage summary (% of total window SOL)
  const sumPctIf = (pred: (w: ExitWallet) => boolean) =>
    exitWallets.filter(pred).reduce((a, b) => a + b.pct_of_window_volume, 0);
  const linkage_summary = {
    dev_funded_pct: sumPctIf(w => w.bucket === 'dev' || w.bucket === 'kyc_root' || w.bucket === 'dev_family'),
    cluster_funded_pct: sumPctIf(w => w.bucket === 'dev_family'),
    launch_sniper_overlap_pct: sumPctIf(w => w.linkage.is_launch_sniper),
    same_funder_pct: sumPctIf(w => w.bucket === 'shared_funder'),
    independent_pct: sumPctIf(w => w.bucket === 'independent' || w.bucket === 'cex_funded' || w.bucket === 'unknown'),
  };

  // Verdict
  let verdict: ExitGroupResult['exit_verdict'];
  const linkageTotal = linkage_summary.dev_funded_pct + linkage_summary.launch_sniper_overlap_pct;
  if (linkageTotal >= 50) verdict = 'pre_planned_exit';
  else if (linkage_summary.same_funder_pct >= 40) verdict = 'coordinated_dump';
  else if (exitWallets.length > 0 && exitWallets[0].pct_of_window_volume > 60) verdict = 'opportunistic_dump';
  else if (exitWallets.length === 0) verdict = 'insufficient_data';
  else verdict = 'organic_distribution';

  const pattern = classifyPattern(windowSells);
  const collapse_window = window ? {
    start: new Date(window.startBt * 1000).toISOString(),
    end: new Date(window.endBt * 1000).toISOString(),
    duration_sec: window.endBt - window.startBt,
    sol_extracted: totalSol,
    seller_count: perWallet.size,
    tx_count: windowSells.length,
  } : null;

  return {
    exit_group: exitWallets,
    exit_pattern: pattern,
    collapse_window,
    exit_group_linkage_summary: linkage_summary,
    exit_verdict: verdict,
    notes,
  };
}
