/**
 * Network Risk & Stability Assessment
 * 
 * Produces one of four signals based on holder distribution, health score,
 * dev reputation, and market momentum — mirroring the /risk TG bot command.
 * 
 * Signals:
 *   🟢 STRONG NETWORK      – Healthy distribution and stable behavior
 *   🟢 MODERATE STRENGTH    – Reasonable distribution with some mixed indicators
 *   🟡 SPECULATIVE NETWORK  – High volatility or uneven distribution
 *   🔴 HIGH RISK            – Concentration warning, dev flags, or active distribution
 */

export interface RiskAssessmentInput {
  healthScore: number;          // 0-100 stability score
  totalHolders: number;
  realHolders: number;
  dustPercentage: number;       // 0-100
  whaleCount: number;
  seriousCount: number;
  top10Pct?: number | null;     // top 10 holders % of supply
  // Optional enrichment
  devTrustLevel?: string | null;      // from dev_wallet_reputation
  devReputationScore?: number | null; // 0-100
  isBlacklisted?: boolean;
  // Momentum (if available)
  momentumScore?: number | null;
  priceChange5m?: number | null;
  buySellRatio?: number | null;
  // AI lifecycle
  lifecycleStage?: string | null;
}

export interface RiskAssessmentResult {
  signal: string;      // e.g. "🟢 STRONG NETWORK"
  label: string;       // e.g. "STRONG NETWORK"
  emoji: string;       // e.g. "🟢"
  detail: string;      // 1-2 sentence explanation
  factors: string[];   // contributing factors
}

export function assessNetworkRisk(input: RiskAssessmentInput): RiskAssessmentResult {
  const factors: string[] = [];
  let score = 0; // accumulate positive/negative points

  // ── Developer flags (strongest override) ──
  if (input.isBlacklisted) {
    return {
      signal: '🔴 HIGH RISK',
      label: 'HIGH RISK',
      emoji: '🔴',
      detail: 'Developer is blacklisted. Known bad actor — extreme caution advised.',
      factors: ['Developer blacklisted'],
    };
  }

  if (['scammer', 'serial_rugger', 'blacklisted'].includes(input.devTrustLevel || '')) {
    return {
      signal: '🔴 HIGH RISK',
      label: 'HIGH RISK',
      emoji: '🔴',
      detail: `Developer flagged as ${input.devTrustLevel}. History of malicious behavior.`,
      factors: [`Dev trust: ${input.devTrustLevel}`],
    };
  }

  // ── Health score contribution ──
  if (input.healthScore >= 70) {
    score += 3;
    factors.push(`Health ${input.healthScore}/100 (strong)`);
  } else if (input.healthScore >= 50) {
    score += 1;
    factors.push(`Health ${input.healthScore}/100 (moderate)`);
  } else if (input.healthScore >= 30) {
    score -= 1;
    factors.push(`Health ${input.healthScore}/100 (weak)`);
  } else {
    score -= 3;
    factors.push(`Health ${input.healthScore}/100 (critical)`);
  }

  // ── Holder count ──
  if (input.realHolders >= 500) {
    score += 2;
    factors.push(`${input.realHolders.toLocaleString()} real holders (deep)`);
  } else if (input.realHolders >= 200) {
    score += 1;
    factors.push(`${input.realHolders.toLocaleString()} real holders (decent)`);
  } else if (input.realHolders >= 50) {
    // neutral
    factors.push(`${input.realHolders.toLocaleString()} real holders (thin)`);
  } else {
    score -= 2;
    factors.push(`${input.realHolders.toLocaleString()} real holders (very thin)`);
  }

  // ── Dust percentage ──
  if (input.dustPercentage > 70) {
    score -= 2;
    factors.push(`${input.dustPercentage}% dust wallets (excessive)`);
  } else if (input.dustPercentage > 50) {
    score -= 1;
    factors.push(`${input.dustPercentage}% dust wallets (high)`);
  } else if (input.dustPercentage < 30) {
    score += 1;
    factors.push(`${input.dustPercentage}% dust wallets (healthy)`);
  }

  // ── Whale concentration ──
  const whaleRatio = input.totalHolders > 0 ? input.whaleCount / input.totalHolders : 0;
  if (whaleRatio > 0.05) {
    score -= 1;
    factors.push(`Whale concentration ${(whaleRatio * 100).toFixed(1)}%`);
  }

  // ── Top 10% supply concentration ──
  if (input.top10Pct != null) {
    if (input.top10Pct > 80) {
      score -= 3;
      factors.push(`Top 10% hold ${input.top10Pct.toFixed(1)}% supply (extreme concentration)`);
    } else if (input.top10Pct > 60) {
      score -= 1;
      factors.push(`Top 10% hold ${input.top10Pct.toFixed(1)}% supply (concentrated)`);
    } else if (input.top10Pct < 40) {
      score += 1;
      factors.push(`Top 10% hold ${input.top10Pct.toFixed(1)}% supply (well distributed)`);
    }
  }

  // ── Developer reputation (when available) ──
  if (input.devReputationScore != null) {
    if (input.devReputationScore >= 70) {
      score += 1;
      factors.push(`Dev reputation ${input.devReputationScore}/100 (trusted)`);
    } else if (input.devReputationScore < 30) {
      score -= 2;
      factors.push(`Dev reputation ${input.devReputationScore}/100 (poor)`);
    }
  }

  if (['serial_spammer', 'fee_farmer'].includes(input.devTrustLevel || '')) {
    score -= 2;
    factors.push(`Dev pattern: ${input.devTrustLevel}`);
  }

  // ── Momentum (if available) ──
  if (input.momentumScore != null) {
    if (input.momentumScore >= 60) {
      score += 1;
      factors.push(`Momentum ${input.momentumScore}/100 (bullish)`);
    } else if (input.momentumScore < 25) {
      score -= 1;
      factors.push(`Momentum ${input.momentumScore}/100 (fading)`);
    }
  }

  // ── Determine signal ──
  if (score >= 5) {
    return {
      signal: '🟢 STRONG NETWORK',
      label: 'STRONG NETWORK',
      emoji: '🟢',
      detail: `Healthy holder distribution with ${input.realHolders.toLocaleString()} real holders and ${input.healthScore}/100 stability. Network shows strong fundamentals.`,
      factors,
    };
  }

  if (score >= 2) {
    return {
      signal: '🟢 MODERATE STRENGTH',
      label: 'MODERATE STRENGTH',
      emoji: '🟢',
      detail: `Reasonable distribution with some mixed indicators. ${input.realHolders.toLocaleString()} real holders, ${input.healthScore}/100 health.`,
      factors,
    };
  }

  if (score >= -2) {
    return {
      signal: '🟡 SPECULATIVE NETWORK',
      label: 'SPECULATIVE NETWORK',
      emoji: '🟡',
      detail: `Uneven distribution or volatile signals. ${input.dustPercentage}% dust wallets, ${input.healthScore}/100 health. Proceed with caution.`,
      factors,
    };
  }

  return {
    signal: '🔴 HIGH RISK',
    label: 'HIGH RISK',
    emoji: '🔴',
    detail: `Concentration warning signals detected. ${input.realHolders.toLocaleString()} real holders, ${input.healthScore}/100 health. High risk of instability.`,
    factors,
  };
}
