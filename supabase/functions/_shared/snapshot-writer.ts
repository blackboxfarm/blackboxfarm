/**
 * Shared helper to upsert token health snapshots.
 * Called from holders-intel-poster, bagless-holders-report, and manual refresh.
 */

import { DbWriteError } from './db-assert.ts';

export interface SnapshotInput {
  tokenMint: string;
  healthScore: number;
  healthGrade: string;
  riskSignal?: string;
  riskLabel?: string;
  riskEmoji?: string;
  totalHolders?: number;
  realHolders?: number;
  dustPercentage?: number;
  whaleCount?: number;
  top10Pct?: number | null;
  whalesPct?: number | null;
  whalesSupplyPct?: number | null;
  seriousPct?: number | null;
  retailPct?: number | null;
  top10SupplyPct?: number | null;
  fdvUsd?: number | null;
  priceUsd?: number | null;
  athMcapUsd?: number | null;
  source: string;
}

/**
 * Truncates a date to the current hour (floor).
 */
function truncateToHour(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Upserts a health snapshot for the current hour.
 * If a snapshot already exists for this token+hour, it updates it.
 */
export async function upsertHealthSnapshot(
  supabase: any,
  input: SnapshotInput
): Promise<void> {
  const snapshotHour = truncateToHour(new Date());

  const { error } = await supabase
    .from('token_health_snapshots')
    .upsert(
      {
        token_mint: input.tokenMint,
        snapshot_hour: snapshotHour,
        health_score: input.healthScore,
        health_grade: input.healthGrade,
        risk_signal: input.riskSignal || null,
        risk_label: input.riskLabel || null,
        risk_emoji: input.riskEmoji || null,
        total_holders: input.totalHolders || null,
        real_holders: input.realHolders || null,
        dust_percentage: input.dustPercentage || null,
        whale_count: input.whaleCount || null,
        top10_pct: input.top10Pct || null,
        whales_pct: input.whalesPct ?? null,
        whales_supply_pct: input.whalesSupplyPct ?? null,
        serious_pct: input.seriousPct ?? null,
        retail_pct: input.retailPct ?? null,
        top10_supply_pct: input.top10SupplyPct ?? null,
        fdv_usd: input.fdvUsd ?? null,
        price_usd: input.priceUsd ?? null,
        ath_mcap_usd: input.athMcapUsd ?? null,
        source: input.source,
      },
      { onConflict: 'token_mint,snapshot_hour' }
    );

  if (error) {
    const errMsg = `[snapshot-writer] FAILED to upsert snapshot for ${input.tokenMint.slice(0, 8)}: ${error.message}`;
    console.error(errMsg);
    throw new DbWriteError('token_health_snapshots', 'UPSERT', error);
  }
  console.log(`[snapshot-writer] Wrote snapshot: ${input.healthGrade} ${input.riskEmoji || ''} for ${input.tokenMint.slice(0, 8)} at ${snapshotHour}`);
}
