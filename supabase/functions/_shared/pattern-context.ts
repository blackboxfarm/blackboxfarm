/**
 * Shared utility: Fetches post-mortem pattern intelligence for injection into AI prompts.
 * Used by: /risk command, AI interpreter, early warning system.
 * 
 * Two layers:
 * 1. Extracted rules from token_pattern_rules (periodic AI extraction)
 * 2. Dynamic similar tokens from token_assessments (real-time cosine similarity)
 */

interface PatternRule {
  rule_id: string;
  pattern_type: string;
  outcome_association: string;
  description: string;
  conditions: Record<string, string>;
  confidence_pct: number;
  sample_size: number;
}

interface SimilarToken {
  symbol: string;
  outcome: string;
  similarity: number;
  health_score: number;
  whale_supply_pct: number;
  dust_pct: number;
  cause_of_death?: string;
}

export interface PatternContext {
  matched_rules: PatternRule[];
  similar_tokens: SimilarToken[];
  death_probability: number; // 0-100 based on rule + similarity
  survival_probability: number;
  training_data_size: number;
  prompt_block: string; // Ready-to-inject text for AI prompts
}

/**
 * Build pattern context for a given token's current metrics.
 * Returns matched rules + similar historical tokens + a prompt block.
 */
export async function getPatternContext(
  supabase: any,
  metrics: {
    mcap_usd?: number;
    real_holders?: number;
    whale_supply_pct?: number;
    dust_pct?: number;
    top10_pct?: number;
    health_score?: number;
    dev_sold_all?: boolean;
    has_twitter?: boolean;
    has_telegram?: boolean;
    bundled_pct?: number;
    buy_sell_ratio?: number;
    volume_mcap_ratio?: number;
    lp_pct?: number;
    fresh_wallet_pct?: number;
  }
): Promise<PatternContext> {
  // Layer 1: Fetch active pattern rules
  const { data: rules } = await supabase
    .from('token_pattern_rules')
    .select('rule_id, pattern_type, outcome_association, description, conditions, confidence_pct, sample_size')
    .eq('is_active', true)
    .order('confidence_pct', { ascending: false })
    .limit(50);

  const allRules: PatternRule[] = rules || [];

  // Match rules against current metrics
  const matched: PatternRule[] = [];
  for (const rule of allRules) {
    if (matchesConditions(rule.conditions, metrics)) {
      matched.push(rule);
    }
  }

  // Layer 2: Fetch similar historical assessments via lightweight comparison
  const { data: historical } = await supabase
    .from('token_assessments')
    .select('symbol, outcome, cause_of_death, health_score, whale_supply_pct, dust_pct, real_holders, mcap_usd, top10_pct, bundled_pct, has_twitter, dev_sold_all')
    .in('assessment_type', ['post_mortem', 'mid_growth'])
    .not('outcome', 'eq', 'pending')
    .order('created_at', { ascending: false })
    .limit(150);

  const allHistorical = historical || [];
  const trainingSize = allHistorical.length;

  // Simple similarity scoring
  const scored = allHistorical.map((h: any) => ({
    symbol: h.symbol,
    outcome: h.outcome,
    cause_of_death: h.cause_of_death,
    health_score: h.health_score || 0,
    whale_supply_pct: h.whale_supply_pct || 0,
    dust_pct: h.dust_pct || 0,
    similarity: quickSimilarity(metrics, h),
  }));
  scored.sort((a: any, b: any) => b.similarity - a.similarity);
  const topSimilar: SimilarToken[] = scored.slice(0, 10);

  // Calculate probabilities from similar tokens
  const deathOutcomes = ['rug', 'pump_dump', 'slow_bleed', 'organic_decline', 'abandoned'];
  const top15 = scored.slice(0, 15);
  const deathCount = top15.filter((t: any) => deathOutcomes.includes(t.outcome)).length;
  const survivalCount = top15.length - deathCount;
  const deathProb = top15.length > 0 ? Math.round((deathCount / top15.length) * 100) : 50;
  const survivalProb = 100 - deathProb;

  // Boost from matched rules
  let ruleDeathBoost = 0;
  let ruleSurvivalBoost = 0;
  for (const r of matched) {
    if (r.pattern_type === 'death_signal') ruleDeathBoost += r.confidence_pct * 0.1;
    else ruleSurvivalBoost += r.confidence_pct * 0.1;
  }

  const finalDeathProb = Math.min(99, Math.max(1, deathProb + ruleDeathBoost - ruleSurvivalBoost));
  const finalSurvivalProb = 100 - finalDeathProb;

  // Build prompt block
  const promptBlock = buildPromptBlock(matched, topSimilar, finalDeathProb, trainingSize);

  return {
    matched_rules: matched,
    similar_tokens: topSimilar,
    death_probability: Math.round(finalDeathProb),
    survival_probability: Math.round(finalSurvivalProb),
    training_data_size: trainingSize,
    prompt_block: promptBlock,
  };
}

function matchesConditions(conditions: Record<string, string>, metrics: Record<string, any>): boolean {
  for (const [key, threshold] of Object.entries(conditions)) {
    const val = metrics[key];
    if (val === undefined || val === null) continue; // Skip unknown metrics

    const strThreshold = String(threshold);
    if (strThreshold === 'true' && val !== true) return false;
    if (strThreshold === 'false' && val !== false) return false;
    if (strThreshold.startsWith('>')) {
      const num = parseFloat(strThreshold.slice(1));
      if (typeof val === 'number' && val <= num) return false;
    }
    if (strThreshold.startsWith('<')) {
      const num = parseFloat(strThreshold.slice(1));
      if (typeof val === 'number' && val >= num) return false;
    }
  }
  return true;
}

function quickSimilarity(current: Record<string, any>, historical: any): number {
  let score = 0;
  let total = 0;

  const compare = (key: string, hKey: string, weight: number, range: number) => {
    const a = current[key];
    const b = historical[hKey];
    if (a != null && b != null && typeof a === 'number' && typeof b === 'number') {
      const diff = Math.abs(a - b) / range;
      score += Math.max(0, 1 - diff) * weight;
    }
    total += weight;
  };

  compare('health_score', 'health_score', 3, 100);
  compare('whale_supply_pct', 'whale_supply_pct', 3, 100);
  compare('dust_pct', 'dust_pct', 2, 100);
  compare('top10_pct', 'top10_pct', 2.5, 100);
  compare('bundled_pct', 'bundled_pct', 2, 50);
  compare('real_holders', 'real_holders', 1.5, 2000);
  compare('mcap_usd', 'mcap_usd', 1, 500000);

  // Boolean matches
  if (current.dev_sold_all === (historical.dev_sold_all || false)) { score += 2; }
  total += 2;
  if (current.has_twitter === (historical.has_twitter || false)) { score += 1; }
  total += 1;

  return total > 0 ? score / total : 0;
}

function buildPromptBlock(
  rules: PatternRule[],
  similar: SimilarToken[],
  deathProb: number,
  trainingSize: number,
): string {
  let block = `\n## 📊 POST-MORTEM INTELLIGENCE (${trainingSize} historical assessments)\n`;

  if (rules.length > 0) {
    block += `\n### Matched Pattern Rules:\n`;
    for (const r of rules.slice(0, 5)) {
      const emoji = r.pattern_type === 'death_signal' ? '💀' : '✅';
      block += `${emoji} **${r.description}** → ${r.outcome_association} (${r.confidence_pct}% confidence, n=${r.sample_size})\n`;
    }
  }

  if (similar.length > 0) {
    block += `\n### Most Similar Historical Tokens:\n`;
    for (const s of similar.slice(0, 7)) {
      const emoji = ['rug', 'pump_dump', 'slow_bleed', 'organic_decline', 'abandoned'].includes(s.outcome) ? '💀' : '✅';
      block += `${emoji} ${s.symbol} → ${s.outcome}${s.cause_of_death ? ` (${s.cause_of_death})` : ''} | Health ${s.health_score} | Similarity ${(s.similarity * 100).toFixed(0)}%\n`;
    }
  }

  block += `\n### Historical Pattern Probability:\n`;
  block += `Death probability: ${deathProb}% | Survival: ${100 - deathProb}%\n`;
  if (trainingSize < 20) block += `⚠️ Low training data — reduce confidence accordingly.\n`;

  return block;
}
