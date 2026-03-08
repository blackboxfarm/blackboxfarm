// Shared token lifecycle phase detection utility
// Used by: bagless-holders-report, token-momentum-analyzer, token-ai-interpreter,
// holdersintel-bot-webhook, wallet-behavior-analysis

export type TokenPhase = 'on_curve' | 'fresh' | 'established' | 'mature';

export interface TokenPhaseResult {
  phase: TokenPhase;
  ageHours: number | null;
  ageMinutes: number | null;
  label: string; // Human-readable: "On Curve", "Fresh (<48h)", etc.
}

/**
 * Detect which lifecycle phase a token is in.
 * 
 * Phase 1: ON CURVE — no Raydium pair OR liquidity < $50k, typically 0-6h
 * Phase 2: FRESH — has Raydium pair with liquidity > $50k, pair age < 48h
 * Phase 3: ESTABLISHED — bonded > 48h, < 14 days
 * Phase 4: MATURE — bonded > 14 days
 */
export function detectTokenPhase(params: {
  pairCreatedAt: number | null; // unix ms timestamp
  liquidityUsd: number | null;
}): TokenPhaseResult {
  const { pairCreatedAt, liquidityUsd } = params;

  // No pair or very low liquidity → still on bonding curve
  if (!pairCreatedAt || (liquidityUsd !== null && liquidityUsd < 50_000)) {
    return {
      phase: 'on_curve',
      ageHours: null,
      ageMinutes: null,
      label: 'On Curve',
    };
  }

  const ageMs = Date.now() - pairCreatedAt;
  const ageMinutes = Math.floor(ageMs / 60_000);
  const ageHours = ageMs / 3_600_000;

  if (ageHours < 48) {
    return { phase: 'fresh', ageHours, ageMinutes, label: 'Fresh (<48h)' };
  }
  if (ageHours < 336) { // 14 days
    return { phase: 'established', ageHours, ageMinutes, label: `Established (${Math.floor(ageHours / 24)}d)` };
  }
  return { phase: 'mature', ageHours, ageMinutes, label: `Mature (${Math.floor(ageHours / 24)}d)` };
}

/**
 * Get a phase-contextual interpretation of a dev reputation score.
 */
export function contextualizeDevRep(repScore: number, phase: TokenPhase): string {
  if (phase === 'on_curve' || phase === 'fresh') {
    if (repScore >= 70) return 'Strong dev rep on a new launch — encouraging but unproven on this token.';
    if (repScore >= 40) return 'Moderate dev rep on a fresh token — no track record on this launch yet.';
    return 'Low dev rep on a brand new token — high caution warranted.';
  }
  if (phase === 'established') {
    if (repScore >= 70) return 'Strong dev with a token that has survived initial volatility.';
    if (repScore >= 40) return 'Moderate dev, but token showing resilience past early phase.';
    return 'Low dev rep, though the token has survived its early days.';
  }
  // mature
  if (repScore >= 70) return 'Strong dev with a proven, mature token.';
  if (repScore >= 40) return 'Moderate dev, but this token has demonstrated independent community support.';
  return 'Low dev rep, but token longevity suggests community-driven survival.';
}
