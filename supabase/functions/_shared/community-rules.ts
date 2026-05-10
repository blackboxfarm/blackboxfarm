/**
 * Recycled X Community detection — pure rules.
 * Inputs are plain primitives so this fn is unit-testable and reusable.
 */

export interface CommunityRuleInput {
  community_created_at: string | null;     // ISO
  token_mint_at: string | null;            // ISO of the fresh token's launch
  member_count: number | null;
  holder_count: number | null;
  name_history_count: number;              // number of prior names (excludes current)
  rename_events: Array<{ at: string }>;    // for frequency calc
  prior_dead_rate_pct: number;             // 0-100
  prior_linked_token_count: number;
  admin_prior_failures: number;            // max across admins
  admin_prior_tokens: number;              // max across admins
}

export interface CommunityRuleSignal {
  key: string;
  label: string;
  fired: boolean;
  detail: string;
  points: number;
}

export interface CommunityScoreResult {
  score: number;            // 0-100
  band: 'clean' | 'suspicious' | 'likely' | 'confirmed';
  signals: CommunityRuleSignal[];
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return null;
  return Math.abs(db - da) / 86400000;
}

export function evaluateCommunity(input: CommunityRuleInput): CommunityScoreResult {
  const signals: CommunityRuleSignal[] = [];
  let score = 0;

  // 1. Community age vs mint date
  const gap = daysBetween(input.community_created_at, input.token_mint_at);
  let gapPts = 0;
  let gapDetail = 'community_created_at or token mint date unknown';
  if (gap !== null) {
    if (gap > 180) gapPts = 40;
    else if (gap > 90) gapPts = 25;
    else if (gap > 30) gapPts = 15;
    gapDetail = `${gap.toFixed(0)} day gap between community creation and token mint`;
  }
  signals.push({
    key: 'age_gap',
    label: 'Community-vs-mint age gap',
    fired: gapPts > 0,
    detail: gapDetail,
    points: gapPts,
  });
  score += gapPts;

  // 2. Name history
  const nh = input.name_history_count;
  let nhPts = 0;
  if (nh >= 4) nhPts = 35;
  else if (nh >= 2) nhPts = 20;
  signals.push({
    key: 'name_history',
    label: 'Prior community names',
    fired: nhPts > 0,
    detail: `${nh} prior name${nh === 1 ? '' : 's'}`,
    points: nhPts,
  });
  score += nhPts;

  // 3. Members vs holders ratio
  const mc = input.member_count ?? 0;
  const hc = input.holder_count ?? 0;
  let ratioPts = 0;
  let ratioDetail = 'insufficient data';
  if (mc > 0 && hc > 0) {
    const ratio = mc / hc;
    if (ratio > 10) ratioPts = 25;
    else if (ratio > 3) ratioPts = 15;
    ratioDetail = `${mc} members vs ${hc} holders (${ratio.toFixed(1)}×)`;
  }
  signals.push({
    key: 'member_holder_ratio',
    label: 'Bloated member/holder ratio',
    fired: ratioPts > 0,
    detail: ratioDetail,
    points: ratioPts,
  });
  score += ratioPts;

  // 4. Prior linked mints dead-rate
  let deadPts = 0;
  if (input.prior_linked_token_count >= 2) {
    if (input.prior_dead_rate_pct > 80) deadPts = 35;
    else if (input.prior_dead_rate_pct > 50) deadPts = 20;
  }
  signals.push({
    key: 'prior_dead_rate',
    label: 'Prior linked mints dead/rugged',
    fired: deadPts > 0,
    detail: `${input.prior_dead_rate_pct}% dead across ${input.prior_linked_token_count} prior linked tokens`,
    points: deadPts,
  });
  score += deadPts;

  // 5. Admin handle = serial dev
  let adminPts = 0;
  if (input.admin_prior_failures >= 2) adminPts = 30;
  signals.push({
    key: 'admin_serial_dev',
    label: 'Admin handle is a known serial dev',
    fired: adminPts > 0,
    detail: input.admin_prior_tokens > 0
      ? `admin has ${input.admin_prior_failures} prior failures across ${input.admin_prior_tokens} tokens`
      : 'no developer profile match for admins',
    points: adminPts,
  });
  score += adminPts;

  // 6. Rename frequency (≥1 rename per 30d on average)
  let freqPts = 0;
  let freqDetail = 'no renames recorded';
  if (input.rename_events.length >= 1 && input.community_created_at) {
    const ageDays = daysBetween(input.community_created_at, new Date().toISOString());
    if (ageDays && ageDays > 0) {
      const perDay = input.rename_events.length / ageDays;
      const renamesPer30d = perDay * 30;
      if (renamesPer30d >= 1) freqPts = 15;
      freqDetail = `${input.rename_events.length} renames over ${ageDays.toFixed(0)} days (${renamesPer30d.toFixed(2)}/30d)`;
    }
  }
  signals.push({
    key: 'rename_frequency',
    label: 'Rename frequency',
    fired: freqPts > 0,
    detail: freqDetail,
    points: freqPts,
  });
  score += freqPts;

  // Cap at 100
  score = Math.min(100, score);

  let band: CommunityScoreResult['band'] = 'clean';
  if (score >= 75) band = 'confirmed';
  else if (score >= 50) band = 'likely';
  else if (score >= 25) band = 'suspicious';

  return { score, band, signals };
}

export const BAND_LABEL: Record<CommunityScoreResult['band'], string> = {
  clean: 'Clean',
  suspicious: 'Suspicious',
  likely: 'Likely Recycled',
  confirmed: 'Confirmed Recycle',
};