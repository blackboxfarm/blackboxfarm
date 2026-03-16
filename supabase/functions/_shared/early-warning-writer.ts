/**
 * Early Warning Writer — populates token_early_warnings cache.
 * Uses UPSERT with scan_count increment for cumulative intelligence.
 * 
 * Language rules:
 * - Use hedging: "alleged", "appears to", "could be", "our analysis suggests"
 * - Never state things as facts: no "is fake", use "seems to be fabricated"
 * - Reference our tools: "our bubble maps detected", "our genealogy trace found"
 * - Street language: "one whale sell = price crash" not "thin liquidity coverage"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EarlyWarning {
  token_mint: string;
  warning_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  plain_text: string;
  metric_value?: number;
  source_function: string;
  metadata?: Record<string, any>;
}

/**
 * Write one or more early warnings for a token.
 * If the warning already exists (same token + type), increments scan_count.
 */
export async function writeEarlyWarnings(
  warnings: EarlyWarning[],
  supabase?: ReturnType<typeof createClient>,
): Promise<void> {
  if (warnings.length === 0) return;

  const client = supabase || createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  for (const w of warnings) {
    try {
      // Check if exists
      const { data: existing } = await client
        .from('token_early_warnings')
        .select('id, scan_count')
        .eq('token_mint', w.token_mint)
        .eq('warning_type', w.warning_type)
        .maybeSingle();

      if (existing) {
        // Increment scan_count, update last_seen and plain_text
        await client.from('token_early_warnings').update({
          scan_count: (existing.scan_count || 1) + 1,
          last_seen_at: new Date().toISOString(),
          plain_text: w.plain_text,
          severity: w.severity,
          metric_value: w.metric_value ?? null,
          metadata: w.metadata ?? {},
        }).eq('id', existing.id);
      } else {
        // Insert new
        await client.from('token_early_warnings').insert({
          token_mint: w.token_mint,
          warning_type: w.warning_type,
          severity: w.severity,
          plain_text: w.plain_text,
          metric_value: w.metric_value ?? null,
          source_function: w.source_function,
          metadata: w.metadata ?? {},
        });
      }
    } catch (err) {
      console.warn(`[early-warning-writer] Failed to write ${w.warning_type} for ${w.token_mint.slice(0, 8)}:`, err);
    }
  }
}

/**
 * Generate warnings from bagless-holders-report data.
 * Called after every holders scan to build cumulative picture.
 */
export function generateWarningsFromHoldersData(
  tokenMint: string,
  data: any,
  sourceFunction: string,
): EarlyWarning[] {
  const warnings: EarlyWarning[] = [];
  const symbol = data?.symbol || data?.tokenSymbol || tokenMint.slice(0, 8);

  // 1. Tier Divergence — whale vs retail gap (context-aware)
  const whalesPct = data?.simpleTiers?.whales?.percentage ?? 0;
  const seriousPct = data?.simpleTiers?.serious?.percentage ?? 0;
  const retailPct = data?.simpleTiers?.retail?.percentage ?? 0;
  const divergence = Math.abs(whalesPct - retailPct);
  const mcap = data?.marketCap ?? data?.mcap ?? 0;
  const totalHolders = data?.totalHolders ?? 0;
  const healthScore = data?.healthScore?.score ?? data?.stabilityScore ?? 50;

  // Only flag if divergence is high AND context suggests actual risk:
  // - High health + growing holder count = organic retail flood, not insider exit
  // - Whales + Serious combined > 10% means money IS present, just outnumbered by retail
  const moneyPresent = whalesPct + seriousPct;
  const isLikelyOrganicGrowth = healthScore >= 60 && totalHolders > 100 && moneyPresent >= 8;

  if (divergence > 35 && !isLikelyOrganicGrowth) {
    const holderLabel = mcap > 100_000 ? 'Big money' : 'Larger holders';
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'tier_divergence_high',
      severity: divergence > 50 ? 'critical' : 'high',
      plain_text: `⚠️ ${holderLabel} and regular buyers are moving in opposite directions — ${divergence.toFixed(0)}% gap. This could mean insiders are exiting while retail buys in.`,
      metric_value: divergence,
      source_function: sourceFunction,
      metadata: { whales_pct: whalesPct, retail_pct: retailPct, serious_pct: seriousPct },
    });
  } else if (divergence > 35 && isLikelyOrganicGrowth) {
    // Healthy growth — note it as informational, not a warning
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'tier_divergence_healthy',
      severity: 'low',
      plain_text: `📊 Retail dominates the holder base (${retailPct.toFixed(0)}%) but ${moneyPresent.toFixed(0)}% are serious+ holders — appears to be organic adoption, not insider exit.`,
      metric_value: divergence,
      source_function: sourceFunction,
      metadata: { whales_pct: whalesPct, retail_pct: retailPct, serious_pct: seriousPct, health: healthScore },
    });
  }

  // 2. Liquidity fragility — one whale sell = crash
  const top10Pct = data?.distributionStats?.top10Percentage ?? 0;
  const lpPct = data?.lpPercentageOfSupply ?? 0;
  if (top10Pct > 60 && lpPct < 20) {
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'liquidity_fragile',
      severity: 'high',
      plain_text: `🚨 Top 10 wallets hold ${top10Pct.toFixed(0)}% of supply but liquidity is only ${lpPct.toFixed(0)}%. One big sell could crash the price hard.`,
      metric_value: top10Pct,
      source_function: sourceFunction,
      metadata: { top10_pct: top10Pct, lp_pct: lpPct },
    });
  }

  // 3. Bundle / insider detection
  const bundledPct = data?.insidersGraph?.bundledPercentage ?? 0;
  const clusterCount = data?.insiderClusters?.length ?? 0;
  if (bundledPct > 5 || clusterCount > 0) {
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'bundle_detected',
      severity: bundledPct > 15 ? 'critical' : 'high',
      plain_text: `🗺️ Our bubble maps detected ${clusterCount > 0 ? `${clusterCount} wallet cluster${clusterCount > 1 ? 's' : ''}` : 'insider wallets'} holding ~${bundledPct.toFixed(1)}% of supply. These wallets appear to be coordinated.`,
      metric_value: bundledPct,
      source_function: sourceFunction,
      metadata: { bundled_pct: bundledPct, cluster_count: clusterCount },
    });
  }

  // 4. Volume/MCap ratio — alleged wash trading
  const vitality = data?.vitality;
  const marketCap = data?.marketCap ?? 0;
  const volume24h = vitality?.volume?.h24 ?? 0;
  if (marketCap > 0 && volume24h > 0) {
    const ratio = volume24h / marketCap;
    if (ratio > 5) {
      warnings.push({
        token_mint: tokenMint,
        warning_type: 'alleged_wash_trading',
        severity: ratio > 10 ? 'critical' : 'high',
        plain_text: `📊 24h volume ($${(volume24h / 1000).toFixed(0)}K) is ${ratio.toFixed(0)}x the market cap ($${(marketCap / 1000).toFixed(0)}K) — this could be a false metric. Legitimate tokens rarely show this pattern.`,
        metric_value: ratio,
        source_function: sourceFunction,
        metadata: { volume_24h: volume24h, market_cap: marketCap, ratio },
      });
    }
  }

  // 5. Fresh wallet concentration
  const freshWallets = data?.freshWallets;
  if (freshWallets?.freshWalletPercentage > 40) {
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'fresh_wallet_concentration',
      severity: 'high',
      plain_text: `🆕 ${freshWallets.freshWalletPercentage.toFixed(0)}% of holders appear to be brand-new wallets. This could suggest manufactured demand.`,
      metric_value: freshWallets.freshWalletPercentage,
      source_function: sourceFunction,
    });
  }

  // 6. Health score critical
  const healthScoreVal = data?.healthScore?.score ?? data?.stabilityScore ?? null;
  if (healthScoreVal != null && healthScoreVal < 25) {
    warnings.push({
      token_mint: tokenMint,
      warning_type: 'health_critical',
      severity: 'critical',
      plain_text: `💔 Health score is ${healthScoreVal}/100. Our analysis suggests this token is in serious trouble.`,
      metric_value: healthScoreVal,
      source_function: sourceFunction,
    });
  }

  return warnings;
}

/**
 * Generate X account credibility warning.
 * Flags: <50 followers, fresh account, OR recycled Account ID (handle rotation).
 */
export function generateXAccountWarning(
  tokenMint: string,
  xData: {
    followerCount?: number;
    accountAge?: string; // ISO date
    isRotated?: boolean;
    handleCount?: number;
    handle?: string;
  },
  sourceFunction: string,
): EarlyWarning | null {
  const followers = xData.followerCount ?? 0;
  const isRotated = xData.isRotated ?? false;
  const handleCount = xData.handleCount ?? 1;

  // Check account age (< 30 days = fresh)
  let isFresh = false;
  if (xData.accountAge) {
    const ageMs = Date.now() - new Date(xData.accountAge).getTime();
    isFresh = ageMs < 30 * 24 * 60 * 60 * 1000;
  }

  const issues: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  if (isRotated && handleCount > 2) {
    issues.push(`recycled identity (${handleCount} different handles on the same account ID — could be evading reputation)`);
    severity = 'high';
  }

  if (followers < 50) {
    issues.push(`only ${followers} followers`);
    if (severity !== 'high') severity = 'medium';
  }

  if (isFresh) {
    issues.push(`account created less than 30 days ago`);
    if (severity !== 'high') severity = 'medium';
  }

  if (issues.length === 0) return null;

  return {
    token_mint: tokenMint,
    warning_type: 'x_low_credibility',
    severity,
    plain_text: `🐦 The linked X account (@${xData.handle || 'unknown'}) has ${issues.join(', ')}. This doesn't prove anything but it's worth noting.`,
    metric_value: followers,
    source_function: sourceFunction,
    metadata: { followers, is_rotated: isRotated, handle_count: handleCount, is_fresh: isFresh },
  };
}

/**
 * Generate dev wallet warning — only flag if genealogy tree ALSO has no history.
 * A fresh dev wallet alone is NOT a red flag (devs often use new wallets).
 * The parent/child wallets need to be checked via genealogy first.
 */
export function generateDevWalletWarning(
  tokenMint: string,
  devData: {
    walletAddress: string;
    totalTokensLaunched?: number;
    trustLevel?: string;
    reputationScore?: number;
    hasGenealogyData?: boolean; // true if we've traced the funding tree
    genealogyHasHistory?: boolean; // true if upstream wallets have track records
    upstreamWalletCount?: number;
  },
  sourceFunction: string,
): EarlyWarning | null {
  const { totalTokensLaunched, trustLevel, hasGenealogyData, genealogyHasHistory } = devData;

  // If we haven't done genealogy yet, don't flag — request it instead
  if (!hasGenealogyData) {
    return null; // Can't judge yet, genealogy needs to run first
  }

  // Fresh wallet + genealogy tree ALSO has no history = suspicious
  if (
    (totalTokensLaunched ?? 0) === 0 &&
    trustLevel === 'unknown' &&
    !genealogyHasHistory
  ) {
    return {
      token_mint: tokenMint,
      warning_type: 'dev_untraceable_origin',
      severity: 'high',
      plain_text: `🔍 Our genealogy trace couldn't find any track record for this developer or their funding wallets (${devData.upstreamWalletCount ?? 0} wallets traced). The origin of funds appears untraceable.`,
      metric_value: devData.reputationScore ?? 0,
      source_function: sourceFunction,
      metadata: {
        wallet: devData.walletAddress,
        tokens_launched: totalTokensLaunched,
        upstream_wallets: devData.upstreamWalletCount,
      },
    };
  }

  return null;
}

/**
 * Read cached warnings for a token — designed for fast auto-scan replies (< 50ms).
 */
export async function getTokenWarnings(
  tokenMint: string,
  supabase?: ReturnType<typeof createClient>,
): Promise<Array<{
  warning_type: string;
  severity: string;
  plain_text: string;
  scan_count: number;
  detected_at: string;
}>> {
  const client = supabase || createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await client
    .from('token_early_warnings')
    .select('warning_type, severity, plain_text, scan_count, detected_at')
    .eq('token_mint', tokenMint)
    .order('severity', { ascending: true }); // critical first

  if (error) {
    console.warn(`[early-warning-reader] Failed to read warnings for ${tokenMint.slice(0, 8)}:`, error);
    return [];
  }

  return data || [];
}
