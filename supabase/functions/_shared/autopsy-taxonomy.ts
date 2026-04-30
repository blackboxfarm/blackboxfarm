/**
 * BlackBox Autopsy — Death Cause Taxonomy v1
 *
 * Canonical list of WAYS A SOLANA TOKEN DIES.
 * Each cause is tagged with:
 *   - intent  : malicious | negligent | neutral | organic
 *   - tier    : A (auto-publish if confidence high) | B (admin queue) | C (skip unless flagged)
 *   - signals : the on-chain / social fingerprints used to detect it
 *
 * Used by:
 *   - autopsy-funnel-feeder      → tier classification of candidates
 *   - autopsy-writer             → narrative angle in the .md
 *   - autopsy-publisher          → routes Tier-A to auto-publish, Tier-B to queue
 */

export type DeathIntent = 'malicious' | 'negligent' | 'neutral' | 'organic';
export type DeathTier = 'A' | 'B' | 'C';

export type DeathCauseId =
  // ── Malicious / pre-planned ───────────────────────────
  | 'coordinated_rug'        // dev + sniper atomic launch-snipe, pre-funded burner, fast dump
  | 'atomic_snipe_rug'       // dev buys >50% of curve in launch tx, dumps within 24h
  | 'liquidity_pulled'       // LP yanked from pool / pump.fun graduation pool drained
  | 'honeypot'               // mint/freeze authority abused to block sells
  | 'mint_authority_abuse'   // unrenounced mint authority, post-launch supply inflation
  | 'wash_trade_exit'        // dev wallets cycle volume to fake activity then exit
  | 'slow_bleed_dump'        // dev drips supply over hours/days into retail bids
  | 'wallet_washer'          // funder consolidates rug proceeds via stablecoin chunks (post-rug fingerprint)
  // ── Pump.fun curve deaths (Lambs ≥75% curve ATH, never graduated) ─────
  | 'curve_snipe_rug'        // dev sold near-zero holdings within 24h on a ≥75% curve
  | 'curve_wallet_washer'    // creator runs linked-wallet cluster; drips sells into new buys; multiple prior dead tokens
  | 'curve_slow_bleed'       // dev_sold over time, ≥90% peak→current decay on a ≥75% curve
  | 'curve_failed_launch'    // ≥75% curve, no wash signals, holders evaporated, dev didn't dump maliciously
  // ── Negligent / soft-rug ───────────────────────────────
  | 'dev_abandonment'        // dev wallet inactive >72h while project is alive, no socials update
  | 'mod_abandonment'        // socials still up but no admin/mod chatter for >24h after chart dip
  | 'failed_launch'          // never gained traction, dev gave up, no malicious dump
  // ── Organic / neutral ──────────────────────────────────
  | 'community_burnout'      // hype decay, no malicious dump, dev still active but volume gone
  | 'hype_decay'             // organic loss of interest after viral peak, no foul play
  | 'organic_death'          // small-cap that never grew, no malice, no abandonment
  // ── Unclassifiable ─────────────────────────────────────
  | 'unknown';

export interface DeathCauseDef {
  id: DeathCauseId;
  label: string;
  intent: DeathIntent;
  tier: DeathTier;
  /** Headline used at the top of the autopsy .md */
  verdict: string;
  /** Short one-line description for cards / OG */
  summary: string;
  /** Detection signals — used by funnel-feeder + AI writer */
  signals: string[];
  /** Min confidence (0-100) required for Tier-A auto-publish */
  autoPublishMinConfidence: number;
}

export const DEATH_TAXONOMY: Record<DeathCauseId, DeathCauseDef> = {
  coordinated_rug: {
    id: 'coordinated_rug',
    label: 'Coordinated Rug',
    intent: 'malicious',
    tier: 'A',
    verdict: 'COORDINATED RUG',
    summary: 'Pre-funded burner + atomic launch-snipe + fast dump cascade.',
    signals: [
      'pre_launch_funding_within_60min',
      'atomic_launch_snipe_pct>50',
      'dump_velocity_score>80',
      'lifetime_hours<48',
      'funder_wallet_consolidates_to_stables_post_dump',
    ],
    autoPublishMinConfidence: 80,
  },
  atomic_snipe_rug: {
    id: 'atomic_snipe_rug',
    label: 'Atomic Snipe Rug',
    intent: 'malicious',
    tier: 'A',
    verdict: 'ATOMIC SNIPE RUG',
    summary: 'Dev consumed >50% of bonding curve in launch tx, dumped <24h.',
    signals: ['dev_buy_pct>50', 'lifetime_hours<24', 'dump_velocity_score>70'],
    autoPublishMinConfidence: 80,
  },
  liquidity_pulled: {
    id: 'liquidity_pulled',
    label: 'Liquidity Pulled',
    intent: 'malicious',
    tier: 'A',
    verdict: 'LP RUGGED',
    summary: 'Liquidity yanked from pool — chart goes vertical to zero.',
    signals: ['lp_pull_score>70', 'liquidity_drop_99pct_in_single_block'],
    autoPublishMinConfidence: 75,
  },
  honeypot: {
    id: 'honeypot',
    label: 'Honeypot',
    intent: 'malicious',
    tier: 'A',
    verdict: 'HONEYPOT',
    summary: 'Mint/freeze authority abused to block sells. Buyers trapped.',
    signals: ['freeze_authority_active', 'sell_tx_count_near_zero', 'buy_tx_count_high'],
    autoPublishMinConfidence: 75,
  },
  mint_authority_abuse: {
    id: 'mint_authority_abuse',
    label: 'Mint Authority Abuse',
    intent: 'malicious',
    tier: 'A',
    verdict: 'SUPPLY INFLATED',
    summary: 'Unrenounced mint authority used to inflate supply post-launch.',
    signals: ['mint_authority_not_renounced', 'supply_increased_post_launch'],
    autoPublishMinConfidence: 75,
  },
  wash_trade_exit: {
    id: 'wash_trade_exit',
    label: 'Wash Trade Exit',
    intent: 'malicious',
    tier: 'B',
    verdict: 'WASH TRADE EXIT',
    summary: 'Dev wallets cycled fake volume to lure retail, then exited.',
    signals: ['linked_wallet_volume_pct>60', 'dev_wallet_cluster_count>3'],
    autoPublishMinConfidence: 85,
  },
  slow_bleed_dump: {
    id: 'slow_bleed_dump',
    label: 'Slow Bleed Dump',
    intent: 'malicious',
    tier: 'B',
    verdict: 'SLOW BLEED',
    summary: 'Dev dripped supply over hours/days into retail bids.',
    signals: ['dump_velocity_score>40', 'dump_velocity_score<=80', 'lifetime_hours>48'],
    autoPublishMinConfidence: 80,
  },
  wallet_washer: {
    id: 'wallet_washer',
    label: 'Wallet Washer',
    intent: 'malicious',
    tier: 'B',
    verdict: 'WALLET WASHER',
    summary: 'Funder consolidates rug proceeds via repeated stablecoin chunks.',
    signals: ['post_dump_usdc_chunks>10', 'funder_wallet_zero_spl_post_event'],
    autoPublishMinConfidence: 80,
  },
  curve_snipe_rug: {
    id: 'curve_snipe_rug',
    label: 'Curve Snipe Rug',
    intent: 'malicious',
    tier: 'A',
    verdict: 'CURVE SNIPE RUG',
    summary: 'Dev dumped near-entire bag on bonding curve ≥75% ATH within 24h.',
    signals: ['bonding_curve_pct>=75', 'dev_sold=true', 'dev_holding_pct<1', 'lifetime_hours<24'],
    autoPublishMinConfidence: 999, // manual approval only — review pending
  },
  curve_wallet_washer: {
    id: 'curve_wallet_washer',
    label: 'Curve Wallet Washer',
    intent: 'malicious',
    tier: 'A',
    verdict: 'CURVE WALLET WASHER',
    summary: 'Creator runs linked-wallet cluster, drips sells into fresh buys, lets the curve bleed out.',
    signals: ['bonding_curve_pct>=75', 'linked_wallet_count>5', 'bundled_buy_count>0', 'creator_prior_dead_tokens>=3'],
    autoPublishMinConfidence: 999,
  },
  curve_slow_bleed: {
    id: 'curve_slow_bleed',
    label: 'Curve Slow Bleed',
    intent: 'malicious',
    tier: 'B',
    verdict: 'CURVE SLOW BLEED',
    summary: 'Dev sold in tranches on a ≥75% curve; peak→current decay >90%.',
    signals: ['bonding_curve_pct>=75', 'dev_sold=true', 'price_decay_pct>90'],
    autoPublishMinConfidence: 999,
  },
  curve_failed_launch: {
    id: 'curve_failed_launch',
    label: 'Curve Failed Launch',
    intent: 'negligent',
    tier: 'B',
    verdict: 'CURVE FADE',
    summary: '≥75% curve ATH, no wash signals, holders evaporated, dev didn\'t dump maliciously.',
    signals: ['bonding_curve_pct>=75', 'dev_sold=false', 'no_wash_signals'],
    autoPublishMinConfidence: 999,
  },
  dev_abandonment: {
    id: 'dev_abandonment',
    label: 'Dev Abandonment',
    intent: 'negligent',
    tier: 'B',
    verdict: 'DEV ABANDONED',
    summary: 'Dev wallet went silent while community still trading. No malicious dump.',
    signals: ['dev_wallet_inactive_hours>72', 'no_malicious_dump', 'mcap_decay_organic'],
    autoPublishMinConfidence: 75,
  },
  mod_abandonment: {
    id: 'mod_abandonment',
    label: 'Mod Abandonment',
    intent: 'negligent',
    tier: 'B',
    verdict: 'MODS ABANDONED',
    summary: 'Socials alive but no admin/mod chatter after chart dip — spam takeover.',
    signals: ['no_admin_message_hours>24', 'chart_dip_pct>50', 'spam_message_pct>40'],
    autoPublishMinConfidence: 70,
  },
  failed_launch: {
    id: 'failed_launch',
    label: 'Failed Launch',
    intent: 'negligent',
    tier: 'C',
    verdict: 'FAILED LAUNCH',
    summary: 'Never gained traction. Dev gave up. No malice detected.',
    signals: ['ath_mcap_usd<5000', 'lifetime_hours>24', 'no_malicious_dump'],
    autoPublishMinConfidence: 90,
  },
  community_burnout: {
    id: 'community_burnout',
    label: 'Community Burnout',
    intent: 'organic',
    tier: 'C',
    verdict: 'BURNOUT',
    summary: 'Hype faded, dev still around, no foul play.',
    signals: ['ath_mcap_usd>10000', 'no_malicious_dump', 'dev_wallet_active_recent'],
    autoPublishMinConfidence: 90,
  },
  hype_decay: {
    id: 'hype_decay',
    label: 'Hype Decay',
    intent: 'organic',
    tier: 'C',
    verdict: 'HYPE DECAY',
    summary: 'Viral peak then organic decline. No malice. No abandonment.',
    signals: ['ath_mcap_usd>50000', 'gradual_volume_decay', 'no_malicious_dump'],
    autoPublishMinConfidence: 90,
  },
  organic_death: {
    id: 'organic_death',
    label: 'Organic Death',
    intent: 'organic',
    tier: 'C',
    verdict: 'ORGANIC DEATH',
    summary: 'Small-cap that never grew. No malice, no abandonment.',
    signals: ['ath_mcap_usd<1000', 'liquidity_usd<500', 'no_malicious_dump'],
    autoPublishMinConfidence: 95,
  },
  unknown: {
    id: 'unknown',
    label: 'Unknown',
    intent: 'neutral',
    tier: 'C',
    verdict: 'UNCLASSIFIED',
    summary: 'Insufficient signals to classify cause of death.',
    signals: [],
    autoPublishMinConfidence: 999,
  },
};

export function tierFor(cause: DeathCauseId): DeathTier {
  return DEATH_TAXONOMY[cause]?.tier ?? 'C';
}

export function shouldAutoPublish(cause: DeathCauseId, confidence: number): boolean {
  const def = DEATH_TAXONOMY[cause];
  if (!def) return false;
  if (def.tier !== 'A') return false;
  return confidence >= def.autoPublishMinConfidence;
}

/**
 * Classify a token using available signals from token_lifecycle + dev_behavior_scores
 * + dev_wallet_reputation + token_social_links.
 * Returns the most specific cause we have evidence for.
 */
export function classifyDeath(input: {
  ageHours: number;
  mcap: number;
  liquidity: number;
  athMcap?: number;
  devBuyPct?: number;
  dumpVelocity?: number;
  lpPullScore?: number;
  preLaunchFundedMins?: number; // minutes between funder→dev SOL transfer and token create
  postDumpUsdcChunks?: number;
  freezeAuthorityActive?: boolean;
  mintAuthorityRenounced?: boolean;
  devWalletInactiveHours?: number;
  noAdminMessageHours?: number;
  spamMessagePct?: number;
  chartDipPct?: number;
  hasMaliciousDump?: boolean;
}): { cause: DeathCauseId; confidence: number; matchedSignals: string[] } {
  const matched: string[] = [];
  const {
    ageHours, mcap, liquidity, athMcap = 0,
    devBuyPct = 0, dumpVelocity = 0, lpPullScore = 0,
    preLaunchFundedMins, postDumpUsdcChunks = 0,
    freezeAuthorityActive, mintAuthorityRenounced,
    devWalletInactiveHours = 0, noAdminMessageHours = 0,
    spamMessagePct = 0, chartDipPct = 0,
    hasMaliciousDump,
  } = input;

  // Honeypot — strongest signal
  if (freezeAuthorityActive) {
    matched.push('freeze_authority_active');
    return { cause: 'honeypot', confidence: 85, matchedSignals: matched };
  }

  // Mint authority abuse
  if (mintAuthorityRenounced === false && athMcap > 0 && mcap < athMcap * 0.05) {
    matched.push('mint_authority_not_renounced');
    return { cause: 'mint_authority_abuse', confidence: 75, matchedSignals: matched };
  }

  // LP pulled
  if (lpPullScore > 70) {
    matched.push('lp_pull_score>70');
    return { cause: 'liquidity_pulled', confidence: Math.min(95, 55 + lpPullScore * 0.4), matchedSignals: matched };
  }

  // Coordinated rug — needs pre-launch funding + atomic snipe + fast dump
  if (preLaunchFundedMins !== undefined && preLaunchFundedMins <= 60 && devBuyPct > 50 && dumpVelocity > 80 && ageHours < 48) {
    matched.push('pre_launch_funding_within_60min', 'atomic_launch_snipe_pct>50', 'dump_velocity_score>80', 'lifetime_hours<48');
    if (postDumpUsdcChunks > 10) matched.push('funder_wallet_consolidates_to_stables_post_dump');
    return { cause: 'coordinated_rug', confidence: 92, matchedSignals: matched };
  }

  // Atomic snipe rug
  if (devBuyPct > 50 && ageHours < 24 && dumpVelocity > 70) {
    matched.push('dev_buy_pct>50', 'lifetime_hours<24', 'dump_velocity_score>70');
    return { cause: 'atomic_snipe_rug', confidence: 85, matchedSignals: matched };
  }

  // Wallet washer (post-rug laundering pattern)
  if (postDumpUsdcChunks > 10 && hasMaliciousDump) {
    matched.push('post_dump_usdc_chunks>10');
    return { cause: 'wallet_washer', confidence: 80, matchedSignals: matched };
  }

  // Slow bleed
  if (dumpVelocity > 40 && dumpVelocity <= 80 && ageHours > 48) {
    matched.push('dump_velocity_score>40', 'dump_velocity_score<=80', 'lifetime_hours>48');
    return { cause: 'slow_bleed_dump', confidence: Math.min(85, 50 + dumpVelocity * 0.4), matchedSignals: matched };
  }

  // Mod abandonment
  if (noAdminMessageHours > 24 && chartDipPct > 50) {
    matched.push('no_admin_message_hours>24', 'chart_dip_pct>50');
    if (spamMessagePct > 40) matched.push('spam_message_pct>40');
    return { cause: 'mod_abandonment', confidence: 70, matchedSignals: matched };
  }

  // Dev abandonment
  if (devWalletInactiveHours > 72 && !hasMaliciousDump) {
    matched.push('dev_wallet_inactive_hours>72', 'no_malicious_dump');
    return { cause: 'dev_abandonment', confidence: 70, matchedSignals: matched };
  }

  // Failed launch
  if (athMcap < 5000 && ageHours > 24 && !hasMaliciousDump) {
    matched.push('ath_mcap_usd<5000', 'lifetime_hours>24', 'no_malicious_dump');
    return { cause: 'failed_launch', confidence: 80, matchedSignals: matched };
  }

  // Hype decay
  if (athMcap > 50000 && !hasMaliciousDump) {
    matched.push('ath_mcap_usd>50000', 'no_malicious_dump');
    return { cause: 'hype_decay', confidence: 70, matchedSignals: matched };
  }

  // Community burnout
  if (athMcap > 10000 && !hasMaliciousDump) {
    matched.push('ath_mcap_usd>10000', 'no_malicious_dump');
    return { cause: 'community_burnout', confidence: 65, matchedSignals: matched };
  }

  // Organic death
  if (mcap < 1000 && liquidity < 500 && !hasMaliciousDump) {
    matched.push('ath_mcap_usd<1000', 'liquidity_usd<500', 'no_malicious_dump');
    return { cause: 'organic_death', confidence: 60, matchedSignals: matched };
  }

  return { cause: 'unknown', confidence: 30, matchedSignals: matched };
}