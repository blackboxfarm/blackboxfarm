// Shared token lifecycle phase detection utility
// Used by: bagless-holders-report, token-momentum-analyzer, token-ai-interpreter,
// holdersintel-bot-webhook, wallet-behavior-analysis

// 8-phase lifecycle model
export type TokenPhase = 'on_curve' | 'newborn' | 'early' | 'adolescent' | 'established' | 'growth' | 'mature' | 'blue_chip';

// Legacy 4-phase for backward compatibility
export type LegacyTokenPhase = 'on_curve' | 'fresh' | 'established' | 'mature';

export interface TokenPhaseResult {
  phase: TokenPhase;
  legacyPhase: LegacyTokenPhase; // Maps back to old 4-phase for consumers not yet updated
  ageHours: number | null;
  ageMinutes: number | null;
  label: string; // Human-readable
}

/**
 * Map new 8-phase to legacy 4-phase for backward compatibility.
 */
export function toLegacyPhase(phase: TokenPhase): LegacyTokenPhase {
  switch (phase) {
    case 'on_curve': return 'on_curve';
    case 'newborn':
    case 'early':
    case 'adolescent': return 'fresh';
    case 'established':
    case 'growth': return 'established';
    case 'mature':
    case 'blue_chip': return 'mature';
  }
}

/**
 * Detect which lifecycle phase a token is in.
 * 
 * Phase 1: ON CURVE     — no Raydium pair OR liquidity < $50k
 * Phase 2: NEWBORN      — bonded < 2h
 * Phase 3: EARLY        — 2h - 12h (concentration, sell pressure critical)
 * Phase 4: ADOLESCENT   — 12h - 48h (holder growth, volume trend)
 * Phase 5: ESTABLISHED  — 2d - 7d (retention, whale stability)
 * Phase 6: GROWTH       — 7d - 30d (volume consistency, LP depth)
 * Phase 7: MATURE       — 30d - 90d (CEX listings, sustained vol)
 * Phase 8: BLUE CHIP    — 90d+ (institutional signals)
 */
export function detectTokenPhase(params: {
  pairCreatedAt: number | null; // unix ms timestamp
  liquidityUsd: number | null;
  volumeH24?: number | null; // optional, used for blue_chip detection
}): TokenPhaseResult {
  const { pairCreatedAt, liquidityUsd, volumeH24 } = params;

  // No pair or very low liquidity → still on bonding curve
  if (!pairCreatedAt || (liquidityUsd !== null && liquidityUsd < 50_000)) {
    return {
      phase: 'on_curve',
      legacyPhase: 'on_curve',
      ageHours: null,
      ageMinutes: null,
      label: 'On Curve',
    };
  }

  const ageMs = Date.now() - pairCreatedAt;
  const ageMinutes = Math.floor(ageMs / 60_000);
  const ageHours = ageMs / 3_600_000;

  if (ageHours < 2) {
    return { phase: 'newborn', legacyPhase: 'fresh', ageHours, ageMinutes, label: 'Newborn (<2h)' };
  }
  if (ageHours < 12) {
    return { phase: 'early', legacyPhase: 'fresh', ageHours, ageMinutes, label: `Early (${Math.round(ageHours)}h)` };
  }
  if (ageHours < 48) {
    return { phase: 'adolescent', legacyPhase: 'fresh', ageHours, ageMinutes, label: `Adolescent (${Math.round(ageHours)}h)` };
  }
  if (ageHours < 168) { // 7 days
    return { phase: 'established', legacyPhase: 'established', ageHours, ageMinutes, label: `Established (${Math.floor(ageHours / 24)}d)` };
  }
  if (ageHours < 720) { // 30 days
    return { phase: 'growth', legacyPhase: 'established', ageHours, ageMinutes, label: `Growth (${Math.floor(ageHours / 24)}d)` };
  }
  if (ageHours < 2160) { // 90 days
    // Blue chip if 90d+ with high volume
    return { phase: 'mature', legacyPhase: 'mature', ageHours, ageMinutes, label: `Mature (${Math.floor(ageHours / 24)}d)` };
  }
  
  // 90d+ — check for blue chip status
  const isBlueChip = (volumeH24 ?? 0) > 1_000_000;
  if (isBlueChip) {
    return { phase: 'blue_chip', legacyPhase: 'mature', ageHours, ageMinutes, label: `Blue Chip (${Math.floor(ageHours / 24)}d)` };
  }
  return { phase: 'mature', legacyPhase: 'mature', ageHours, ageMinutes, label: `Mature (${Math.floor(ageHours / 24)}d)` };
}

/**
 * Get a phase-contextual interpretation of a dev reputation score.
 * Updated to handle 8-phase model.
 */
export function contextualizeDevRep(repScore: number, phase: TokenPhase): string {
  // Group phases for interpretation
  const isEarly = phase === 'on_curve' || phase === 'newborn' || phase === 'early' || phase === 'adolescent';
  const isMid = phase === 'established' || phase === 'growth';
  // mature / blue_chip

  if (isEarly) {
    if (repScore >= 70) return 'Strong dev rep on a new launch — encouraging but unproven on this token.';
    if (repScore >= 40) return 'Moderate dev rep on a fresh token — no track record on this launch yet.';
    return 'Low dev rep on a brand new token — high caution warranted.';
  }
  if (isMid) {
    if (repScore >= 70) return 'Strong dev with a token that has survived initial volatility.';
    if (repScore >= 40) return 'Moderate dev, but token showing resilience past early phase.';
    return 'Low dev rep, though the token has survived its early days.';
  }
  // mature / blue_chip
  if (repScore >= 70) return 'Strong dev with a proven, mature token.';
  if (repScore >= 40) return 'Moderate dev, but this token has demonstrated independent community support.';
  return 'Low dev rep, but token longevity suggests community-driven survival.';
}
