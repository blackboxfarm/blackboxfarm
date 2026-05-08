/**
 * Token Lifecycle → Dev Reputation scoring engine (v1.0)
 * Pure functions — no IO. Consumers gather inputs and call score().
 */

export interface LifecycleInputs {
  token_mint: string;
  dev_wallet: string | null;
  // mint/bonding
  bundle_pct_first_5_blocks?: number;   // 0..100
  dev_buy_then_sell_during_bonding?: boolean;
  bonded_in_minutes?: number | null;
  dev_bonding_volume_pct?: number;       // 0..100
  // graduation
  graduated?: boolean;
  liquidity_locked?: boolean;
  mint_authority_revoked?: boolean;
  freeze_authority_revoked?: boolean;
  burn_events_count?: number;
  // sustain
  ath_mcap_usd?: number;
  hours_in_top_200?: number;
  buybacks_usd?: number;
  boosts_usd?: number;
  pumpfun_live_count?: number;
  // social
  has_website?: boolean;
  telegram_members?: number;
  telegram_active_admins?: number;
  x_community_members?: number;
  cto_handover?: boolean;
  socials_alive_post_death?: boolean;
  // mesh
  associative_wallets_count?: number;
  bundle_responsibility_score?: number; // -100..100
  kyc_root_reached?: boolean;
  cex_label?: string | null;
  // negative signals
  scammy_pattern_detected?: boolean;
  rug_detected?: boolean;
}

export interface FactorScore {
  score: number;       // -100..100
  weight: number;      // 0..1
  evidence: any;
  present: boolean;
}

export interface ScoreResult {
  worth_gate_passed: boolean;
  worth_gate_reasons: string[];
  phase_scores: {
    mint_bonding: number;
    graduation: number;
    sustain: number;
    social: number;
    wallet_mesh: number;
  };
  factor_scores: Record<string, FactorScore>;
  composite_score: number;
  effort_score: number;
  skill_score: number;
  integrity_score: number;
  sustain_score: number;
  social_score: number;
  verdict: string;
  verdict_confidence: number;
}

const clamp = (n: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, n));

function avg(factors: FactorScore[]): number {
  const present = factors.filter(f => f.present);
  if (!present.length) return 0;
  const totalW = present.reduce((s, f) => s + f.weight, 0) || 1;
  return clamp(present.reduce((s, f) => s + f.score * f.weight, 0) / totalW);
}

function f(score: number, weight: number, evidence: any, present = true): FactorScore {
  return { score: clamp(score), weight, evidence, present };
}

export function scoreLifecycle(
  i: LifecycleInputs,
  worthGate: { passed: boolean; reasons: string[] }
): ScoreResult {
  const factors: Record<string, FactorScore> = {};

  // ── Mint & Bonding ──
  factors.bundle_concentration = f(
    i.bundle_pct_first_5_blocks == null ? 0 : -Math.min(100, i.bundle_pct_first_5_blocks * 1.5),
    0.9,
    { bundle_pct_first_5_blocks: i.bundle_pct_first_5_blocks ?? null },
    i.bundle_pct_first_5_blocks != null
  );
  factors.dev_bonding_dump = f(
    i.dev_buy_then_sell_during_bonding ? -80 : 30,
    0.8,
    { dumped: i.dev_buy_then_sell_during_bonding ?? false },
    i.dev_buy_then_sell_during_bonding !== undefined
  );
  factors.bonding_speed = f(
    i.bonded_in_minutes == null ? 0
      : i.bonded_in_minutes < 5 ? 40
      : i.bonded_in_minutes < 60 ? 60
      : i.bonded_in_minutes < 360 ? 30
      : -10,
    0.5,
    { bonded_in_minutes: i.bonded_in_minutes ?? null },
    i.bonded_in_minutes != null
  );
  factors.dev_volume_share = f(
    i.dev_bonding_volume_pct == null ? 0
      : i.dev_bonding_volume_pct > 50 ? -60
      : i.dev_bonding_volume_pct > 25 ? -20 : 20,
    0.6,
    { dev_bonding_volume_pct: i.dev_bonding_volume_pct ?? null },
    i.dev_bonding_volume_pct != null
  );

  // ── Graduation ──
  factors.graduated = f(
    i.graduated ? 80 : -20,
    1.0,
    { graduated: !!i.graduated },
    i.graduated !== undefined
  );
  factors.liquidity_locked = f(
    i.liquidity_locked ? 60 : -30,
    0.8,
    { liquidity_locked: !!i.liquidity_locked },
    i.liquidity_locked !== undefined
  );
  factors.mint_revoked = f(
    i.mint_authority_revoked ? 50 : -30,
    0.7,
    { mint_authority_revoked: !!i.mint_authority_revoked },
    i.mint_authority_revoked !== undefined
  );
  factors.freeze_revoked = f(
    i.freeze_authority_revoked ? 40 : -20,
    0.6,
    { freeze_authority_revoked: !!i.freeze_authority_revoked },
    i.freeze_authority_revoked !== undefined
  );
  factors.burn_events = f(
    !i.burn_events_count ? 0 : Math.min(60, i.burn_events_count * 20),
    0.5,
    { burn_events_count: i.burn_events_count ?? 0 },
    (i.burn_events_count ?? 0) > 0
  );

  // ── Sustain / Effort ──
  factors.ath_mcap = f(
    !i.ath_mcap_usd ? 0
      : i.ath_mcap_usd >= 5_000_000 ? 100
      : i.ath_mcap_usd >= 1_000_000 ? 80
      : i.ath_mcap_usd >= 500_000 ? 60
      : i.ath_mcap_usd >= 200_000 ? 40
      : i.ath_mcap_usd >= 100_000 ? 25
      : i.ath_mcap_usd >= 25_000 ? 10 : -10,
    1.0,
    { ath_mcap_usd: i.ath_mcap_usd ?? null },
    i.ath_mcap_usd != null
  );
  factors.hours_top_200 = f(
    !i.hours_in_top_200 ? 0 : Math.min(100, i.hours_in_top_200 * 2),
    0.8,
    { hours_in_top_200: i.hours_in_top_200 ?? 0 },
    (i.hours_in_top_200 ?? 0) > 0
  );
  factors.buybacks = f(
    !i.buybacks_usd ? 0 : Math.min(100, i.buybacks_usd / 100),
    0.7,
    { buybacks_usd: i.buybacks_usd ?? 0 },
    (i.buybacks_usd ?? 0) > 0
  );
  factors.boosts = f(
    !i.boosts_usd ? 0 : Math.min(60, i.boosts_usd / 50),
    0.4,
    { boosts_usd: i.boosts_usd ?? 0 },
    (i.boosts_usd ?? 0) > 0
  );
  factors.pumpfun_live = f(
    !i.pumpfun_live_count ? 0 : Math.min(60, i.pumpfun_live_count * 15),
    0.5,
    { pumpfun_live_count: i.pumpfun_live_count ?? 0 },
    (i.pumpfun_live_count ?? 0) > 0
  );

  // ── Social ──
  factors.website = f(i.has_website ? 30 : -10, 0.5, { has_website: !!i.has_website }, i.has_website !== undefined);
  factors.telegram_health = f(
    !i.telegram_members ? 0
      : i.telegram_members >= 1000 ? 70
      : i.telegram_members >= 200 ? 40
      : i.telegram_members >= 50 ? 15 : -10,
    0.7,
    { telegram_members: i.telegram_members ?? 0, active_admins: i.telegram_active_admins ?? 0 },
    i.telegram_members != null
  );
  factors.x_community = f(
    !i.x_community_members ? 0
      : i.x_community_members >= 1000 ? 60
      : i.x_community_members >= 200 ? 30 : 10,
    0.6,
    { x_community_members: i.x_community_members ?? 0 },
    i.x_community_members != null
  );
  factors.cto_handover = f(
    i.cto_handover ? 40 : (i.socials_alive_post_death ? 20 : -10),
    0.4,
    { cto_handover: !!i.cto_handover, socials_alive_post_death: !!i.socials_alive_post_death },
    i.cto_handover !== undefined || i.socials_alive_post_death !== undefined
  );

  // ── Wallet / Mesh ──
  factors.kyc_root = f(
    i.kyc_root_reached ? 40 : -10,
    0.6,
    { cex_label: i.cex_label ?? null },
    i.kyc_root_reached !== undefined
  );
  factors.bundle_responsibility = f(
    i.bundle_responsibility_score ?? 0,
    0.7,
    { bundle_responsibility_score: i.bundle_responsibility_score ?? null },
    i.bundle_responsibility_score != null
  );
  factors.scammy_pattern = f(
    i.scammy_pattern_detected ? -100 : 10,
    1.0,
    { detected: !!i.scammy_pattern_detected },
    i.scammy_pattern_detected !== undefined
  );
  factors.rug = f(
    i.rug_detected ? -100 : 10,
    1.0,
    { detected: !!i.rug_detected },
    i.rug_detected !== undefined
  );

  // Group factors by phase
  const groups = {
    mint_bonding: [factors.bundle_concentration, factors.dev_bonding_dump, factors.bonding_speed, factors.dev_volume_share],
    graduation: [factors.graduated, factors.liquidity_locked, factors.mint_revoked, factors.freeze_revoked, factors.burn_events],
    sustain: [factors.ath_mcap, factors.hours_top_200, factors.buybacks, factors.boosts, factors.pumpfun_live],
    social: [factors.website, factors.telegram_health, factors.x_community, factors.cto_handover],
    wallet_mesh: [factors.kyc_root, factors.bundle_responsibility, factors.scammy_pattern, factors.rug],
  };

  const phase_scores = {
    mint_bonding: avg(groups.mint_bonding),
    graduation: avg(groups.graduation),
    sustain: avg(groups.sustain),
    social: avg(groups.social),
    wallet_mesh: avg(groups.wallet_mesh),
  };

  // 5 lenses
  const effort = avg([factors.buybacks, factors.boosts, factors.pumpfun_live, factors.telegram_health, factors.x_community, factors.website]);
  const skill = avg([factors.bonding_speed, factors.graduated, factors.liquidity_locked, factors.ath_mcap, factors.hours_top_200]);
  const integrity = avg([factors.dev_bonding_dump, factors.bundle_concentration, factors.scammy_pattern, factors.rug, factors.bundle_responsibility, factors.mint_revoked, factors.freeze_revoked]);
  const sustain = avg([factors.ath_mcap, factors.hours_top_200, factors.cto_handover, factors.burn_events]);
  const social = phase_scores.social;

  const composite = clamp((effort + skill + integrity * 1.2 + sustain + social) / 5.2);

  // Verdict
  let verdict = 'inexperienced';
  if (factors.rug.present && i.rug_detected) verdict = 'scammy';
  else if (factors.scammy_pattern.present && i.scammy_pattern_detected) verdict = 'scammy';
  else if (composite >= 70 && integrity > 30) verdict = 'expert';
  else if (composite >= 50 && integrity > 0) verdict = 'competent';
  else if (composite >= 30) verdict = 'sloppy';
  else if (integrity < -30) verdict = 'shark';
  else if (effort < 0 && social < 0) verdict = 'tourist';
  else verdict = 'inexperienced';

  // Map negative composite to a 0..100 confidence (extremes = high confidence)
  const verdict_confidence = clamp(50 + Math.abs(composite) / 2, 0, 100);

  return {
    worth_gate_passed: worthGate.passed,
    worth_gate_reasons: worthGate.reasons,
    phase_scores,
    factor_scores: factors,
    composite_score: Math.round(composite),
    effort_score: Math.round(effort),
    skill_score: Math.round(skill),
    integrity_score: Math.round(integrity),
    sustain_score: Math.round(sustain),
    social_score: Math.round(social),
    verdict,
    verdict_confidence: Math.round(verdict_confidence),
  };
}

/** Roll up an array of token scorecards into a single dev reputation. */
export function rollupDevReputation(scorecards: Array<{
  token_mint: string;
  composite_score: number;
  effort_score: number;
  skill_score: number;
  integrity_score: number;
  sustain_score: number;
  social_score: number;
  verdict: string;
  scored_at: string;
}>) {
  if (!scorecards.length) return null;
  const sorted = [...scorecards].sort((a, b) => b.composite_score - a.composite_score);
  const best3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const w = (best: number[], rest: number[]) => {
    const top = best.reduce((s, x) => s + x * 1.0, 0);
    const tail = rest.reduce((s, x) => s + x * 0.6, 0);
    const denom = best.length * 1.0 + rest.length * 0.6 || 1;
    return Math.round((top + tail) / denom);
  };
  const pluck = (k: keyof typeof scorecards[number]) => scorecards.map(s => Number(s[k] ?? 0));

  const weighted_skill = w(best3.map(s => s.skill_score), rest.map(s => s.skill_score));
  const weighted_sustain = w(best3.map(s => s.sustain_score), rest.map(s => s.sustain_score));
  const weighted_social = w(best3.map(s => s.social_score), rest.map(s => s.social_score));
  // effort + integrity = roll across ALL tokens (can't hide spam behind one winner)
  const weighted_effort = Math.round(pluck('effort_score').reduce((s, x) => s + x, 0) / scorecards.length);
  const weighted_integrity = Math.round(pluck('integrity_score').reduce((s, x) => s + x, 0) / scorecards.length);
  const composite = Math.round((weighted_effort + weighted_skill + weighted_integrity * 1.2 + weighted_sustain + weighted_social) / 5.2);

  const distribution: Record<string, number> = {};
  for (const s of scorecards) distribution[s.verdict] = (distribution[s.verdict] || 0) + 1;

  const career_arc = [...scorecards]
    .sort((a, b) => a.scored_at.localeCompare(b.scored_at))
    .map(s => ({ token_mint: s.token_mint, verdict: s.verdict, composite: s.composite_score, scored_at: s.scored_at }));

  let archetype = 'tourist';
  const expertCount = (distribution.expert || 0) + (distribution.competent || 0);
  const scamCount = (distribution.scammy || 0) + (distribution.shark || 0);
  if (scamCount >= 2 || (scarcityRatio(scamCount, scorecards.length) >= 0.5)) archetype = scamCount >= 2 && weighted_integrity < -30 ? 'rugger' : 'shark';
  else if (composite >= 65 && weighted_integrity > 20) archetype = 'builder';
  else if (weighted_effort > 30 && expertCount >= 2) archetype = 'grinder';
  else if (weighted_skill > 30 && weighted_integrity < 0) archetype = 'sniper';
  else if (composite < 0) archetype = 'rugger';
  else archetype = 'tourist';

  return {
    tokens_scored: scorecards.length,
    distribution,
    career_arc,
    weighted_effort,
    weighted_skill,
    weighted_integrity,
    weighted_sustain,
    weighted_social,
    composite,
    archetype,
    best_token_mint: sorted[0]?.token_mint ?? null,
    worst_token_mint: sorted[sorted.length - 1]?.token_mint ?? null,
  };
}

function scarcityRatio(part: number, total: number) {
  return total ? part / total : 0;
}