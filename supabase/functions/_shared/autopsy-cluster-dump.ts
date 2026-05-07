/**
 * autopsy-cluster-dump
 *
 * Given the co-snipers detected in the launch tx, trace each one back to its
 * funder using discoverFunding(). Bucket each sniper into:
 *   - dev_funded     : funder == dev OR funder == kyc_root
 *   - cluster_funded : funder ∈ dossier.cluster_wallets
 *   - same_funder    : multiple snipers share the same upstream funder
 *   - cex_funded     : funder is in cex-wallets registry
 *   - unknown
 *
 * Returns a verdict + cluster_capture_pct so the writer / classifier can
 * recognise a coordinated bundle even when no single wallet looks malicious.
 */

import { discoverFunding } from './funding-resolver.ts';
import { isCexWallet, getCexName } from './cex-wallets.ts';

export interface SniperProvenance {
  wallet: string;
  amount_tokens: number;
  pct_of_curve: number | null;
  funder: string | null;
  funder_label: string | null;
  bucket: 'dev_funded' | 'cluster_funded' | 'same_funder' | 'cex_funded' | 'unknown';
}

export interface ClusterDumpResult {
  snipers_with_provenance: SniperProvenance[];
  cluster_capture_pct: number;
  verdict: 'coordinated_bundle' | 'mixed' | 'organic' | 'insufficient_data';
  notes: string[];
}

export async function traceClusterDump(opts: {
  devWallet: string;
  kycRoot?: string | null;
  clusterWallets?: string[];
  coSnipers: Array<{ wallet: string; amount_tokens: number; pct_of_curve: number | null }>;
}): Promise<ClusterDumpResult> {
  const { devWallet, kycRoot, clusterWallets = [], coSnipers } = opts;
  const notes: string[] = [];

  if (!coSnipers || coSnipers.length === 0) {
    return { snipers_with_provenance: [], cluster_capture_pct: 0, verdict: 'insufficient_data', notes: ['no co-snipers in launch tx'] };
  }

  const clusterSet = new Set<string>([devWallet, ...(kycRoot ? [kycRoot] : []), ...clusterWallets]);

  // Cap how many we trace to bound Helius spend.
  const tracedSnipers = coSnipers.slice(0, 8);
  const provenance: SniperProvenance[] = [];
  const funderHits = new Map<string, number>();

  for (const s of tracedSnipers) {
    let funder: string | null = null;
    let funderLabel: string | null = null;
    try {
      const f = await discoverFunding(s.wallet);
      funder = f?.funder ?? null;
      funderLabel = f?.funderName ?? f?.funderType ?? null;
    } catch (e) {
      notes.push(`funding lookup failed for ${s.wallet.slice(0, 8)}: ${(e as Error).message}`);
    }

    let bucket: SniperProvenance['bucket'] = 'unknown';
    if (funder) {
      if (funder === devWallet || (kycRoot && funder === kycRoot)) bucket = 'dev_funded';
      else if (clusterSet.has(funder)) bucket = 'cluster_funded';
      else if (isCexWallet(funder)) {
        bucket = 'cex_funded';
        funderLabel = funderLabel ?? getCexName(funder);
      }
      funderHits.set(funder, (funderHits.get(funder) ?? 0) + 1);
    }

    provenance.push({
      wallet: s.wallet,
      amount_tokens: s.amount_tokens,
      pct_of_curve: s.pct_of_curve,
      funder,
      funder_label: funderLabel,
      bucket,
    });
  }

  // Promote 'unknown' wallets to 'same_funder' when multiple share an upstream funder.
  for (const p of provenance) {
    if (p.bucket === 'unknown' && p.funder && (funderHits.get(p.funder) ?? 0) > 1) {
      p.bucket = 'same_funder';
    }
  }

  const totalPct = tracedSnipers.reduce((acc, s) => acc + (s.pct_of_curve ?? 0), 0);
  const capturedPct = provenance
    .filter(p => p.bucket === 'dev_funded' || p.bucket === 'cluster_funded' || p.bucket === 'same_funder')
    .reduce((acc, p) => acc + (p.pct_of_curve ?? 0), 0);

  const cluster_capture_pct = totalPct > 0 ? (capturedPct / totalPct) * 100 : 0;

  let verdict: ClusterDumpResult['verdict'];
  if (cluster_capture_pct >= 50) verdict = 'coordinated_bundle';
  else if (cluster_capture_pct >= 20) verdict = 'mixed';
  else if (provenance.every(p => p.bucket === 'unknown')) verdict = 'insufficient_data';
  else verdict = 'organic';

  return { snipers_with_provenance: provenance, cluster_capture_pct, verdict, notes };
}