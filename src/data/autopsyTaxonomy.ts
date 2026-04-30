/**
 * Client-side mirror of supabase/functions/_shared/autopsy-taxonomy.ts
 * Kept in sync manually — used by the Death-Cause Taxonomy modal in the
 * Super Admin Autopsy Queue. JSON-safe subset only.
 */

export type DeathIntent = "malicious" | "negligent" | "neutral" | "organic";
export type DeathTier = "A" | "B" | "C";

export interface DeathCauseClient {
  id: string;
  label: string;
  intent: DeathIntent;
  tier: DeathTier;
  verdict: string;
  summary: string;
  /** Long-form explanation shown in the taxonomy modal. */
  description: string;
  signals: string[];
  autoPublishMinConfidence: number;
}

export const DEATH_TAXONOMY_CLIENT: DeathCauseClient[] = [
  // ── Malicious / Tier-A ─────────────────────────────────
  {
    id: "coordinated_rug",
    label: "Coordinated Rug",
    intent: "malicious",
    tier: "A",
    verdict: "COORDINATED RUG",
    summary: "Pre-funded burner + atomic launch-snipe + fast dump cascade.",
    description:
      "The dev wallet receives SOL from a funder within ~60 minutes of token creation, immediately consumes more than half of the bonding curve in the launch transaction, then dumps within 48 hours. Post-dump the funder typically consolidates proceeds into stablecoins. This is the textbook pre-meditated rug — every step is choreographed to extract retail liquidity in one cycle.",
    signals: [
      "pre_launch_funding_within_60min",
      "atomic_launch_snipe_pct>50",
      "dump_velocity_score>80",
      "lifetime_hours<48",
      "funder_wallet_consolidates_to_stables_post_dump",
    ],
    autoPublishMinConfidence: 80,
  },
  {
    id: "atomic_snipe_rug",
    label: "Atomic Snipe Rug",
    intent: "malicious",
    tier: "A",
    verdict: "ATOMIC SNIPE RUG",
    summary: "Dev consumed >50% of bonding curve in launch tx, dumped <24h.",
    description:
      "A single-actor variant of the coordinated rug. The deployer buys a dominant share of the curve in the same transaction (or block) as the mint, then sells into the first wave of organic buyers within 24 hours. No external funder choreography is required — the deployer's own wallet handles everything.",
    signals: ["dev_buy_pct>50", "lifetime_hours<24", "dump_velocity_score>70"],
    autoPublishMinConfidence: 80,
  },
  {
    id: "liquidity_pulled",
    label: "Liquidity Pulled",
    intent: "malicious",
    tier: "A",
    verdict: "LP RUGGED",
    summary: "Liquidity yanked from pool — chart goes vertical to zero.",
    description:
      "Liquidity is removed from the AMM pool (Raydium / Meteora / pump.fun graduated pool) in a single block, sending price to effectively zero. Buyers are left holding tokens with no market. This usually requires unlocked LP tokens or a non-renounced pool authority.",
    signals: ["lp_pull_score>70", "liquidity_drop_99pct_in_single_block"],
    autoPublishMinConfidence: 75,
  },
  {
    id: "honeypot",
    label: "Honeypot",
    intent: "malicious",
    tier: "A",
    verdict: "HONEYPOT",
    summary: "Mint/freeze authority abused to block sells. Buyers trapped.",
    description:
      "The token retains an active freeze authority or sell-blocking program logic. Buys succeed, but sells revert or are blacklisted. Detected by an extremely lopsided buy/sell tx ratio and the freeze authority remaining un-renounced after launch.",
    signals: ["freeze_authority_active", "sell_tx_count_near_zero", "buy_tx_count_high"],
    autoPublishMinConfidence: 75,
  },
  {
    id: "mint_authority_abuse",
    label: "Mint Authority Abuse",
    intent: "malicious",
    tier: "A",
    verdict: "SUPPLY INFLATED",
    summary: "Unrenounced mint authority used to inflate supply post-launch.",
    description:
      "The deployer leaves the SPL mint authority active and uses it to print additional supply after launch, diluting holders. The chart typically shows a fast collapse once the new supply hits the market. Fingerprint: total supply increases in transactions signed by the original deployer or a delegated authority.",
    signals: ["mint_authority_not_renounced", "supply_increased_post_launch"],
    autoPublishMinConfidence: 75,
  },

  // ── Malicious / Tier-B ─────────────────────────────────
  {
    id: "wash_trade_exit",
    label: "Wash Trade Exit",
    intent: "malicious",
    tier: "B",
    verdict: "WASH TRADE EXIT",
    summary: "Dev wallets cycled fake volume to lure retail, then exited.",
    description:
      "A cluster of linked wallets (shared funder, shared timing, or shared on-chain history) trade the token back and forth to manufacture volume and chart action. Once organic buyers arrive, the cluster exits as a single block. Detected by linked-wallet volume share exceeding 60% of total volume.",
    signals: ["linked_wallet_volume_pct>60", "dev_wallet_cluster_count>3"],
    autoPublishMinConfidence: 85,
  },
  {
    id: "slow_bleed_dump",
    label: "Slow Bleed Dump",
    intent: "malicious",
    tier: "B",
    verdict: "SLOW BLEED",
    summary: "Dev dripped supply over hours/days into retail bids.",
    description:
      "Rather than a single exit transaction, the dev splits their bag into many smaller sells over 48+ hours, hiding the dump inside organic flow. The dump-velocity score lands in the 40–80 band — not instant, but clearly net-distributive. Often paired with continued mod chatter to keep the hopium going.",
    signals: ["dump_velocity_score>40", "dump_velocity_score<=80", "lifetime_hours>48"],
    autoPublishMinConfidence: 80,
  },
  {
    id: "wallet_washer",
    label: "Wallet Washer",
    intent: "malicious",
    tier: "B",
    verdict: "WALLET WASHER",
    summary: "Funder consolidates rug proceeds via repeated stablecoin chunks.",
    description:
      "A post-event laundering fingerprint: after a malicious dump, the funder wallet receives repeated USDC/USDT chunks from the dev cluster and ends in a near-zero SPL state. This pattern is what links a one-off rug back to a serial operator across many tokens.",
    signals: ["post_dump_usdc_chunks>10", "funder_wallet_zero_spl_post_event"],
    autoPublishMinConfidence: 80,
  },

  // ── Negligent / Tier-B ─────────────────────────────────
  {
    id: "dev_abandonment",
    label: "Dev Abandonment",
    intent: "negligent",
    tier: "B",
    verdict: "DEV ABANDONED",
    summary: "Dev wallet went silent while community still trading. No malicious dump.",
    description:
      "The deployer wallet shows no on-chain activity for 72+ hours while the token is still being traded. There is no large coordinated dump — the dev simply walked away. Common in 'fire-and-forget' launches where the dev has dozens of failed tokens and never returns to any of them.",
    signals: ["dev_wallet_inactive_hours>72", "no_malicious_dump", "mcap_decay_organic"],
    autoPublishMinConfidence: 75,
  },
  {
    id: "mod_abandonment",
    label: "Mod Abandonment",
    intent: "negligent",
    tier: "B",
    verdict: "MODS ABANDONED",
    summary: "Socials alive but no admin/mod chatter after chart dip — spam takeover.",
    description:
      "The Telegram/X presence remains technically online but admins stop posting after a major chart dip. Spam and shill accounts take over the channel. Holders are left without official communication, which is itself a signal — silence after a >50% draw-down is rarely accidental.",
    signals: ["no_admin_message_hours>24", "chart_dip_pct>50", "spam_message_pct>40"],
    autoPublishMinConfidence: 70,
  },
  {
    id: "failed_launch",
    label: "Failed Launch",
    intent: "negligent",
    tier: "C",
    verdict: "FAILED LAUNCH",
    summary: "Never gained traction. Dev gave up. No malice detected.",
    description:
      "The token never reached escape velocity — ATH stayed below $5k, the curve never filled, and the dev quietly stopped paying attention. There is no malicious dump because there was nothing meaningful to dump. The vast majority of pump.fun mints die this way; we autopsy the noteworthy ones for the dev's pattern, not the token itself.",
    signals: ["ath_mcap_usd<5000", "lifetime_hours>24", "no_malicious_dump"],
    autoPublishMinConfidence: 90,
  },

  // ── Organic / Tier-C ───────────────────────────────────
  {
    id: "community_burnout",
    label: "Community Burnout",
    intent: "organic",
    tier: "C",
    verdict: "BURNOUT",
    summary: "Hype faded, dev still around, no foul play.",
    description:
      "ATH was meaningful (>$10k) and the dev wallet is still active, but the community lost interest. Volume decayed gradually, holders trickled out, and the chart settled into a low-liquidity grave. No rug, no abandonment — just attention moving on.",
    signals: ["ath_mcap_usd>10000", "no_malicious_dump", "dev_wallet_active_recent"],
    autoPublishMinConfidence: 90,
  },
  {
    id: "hype_decay",
    label: "Hype Decay",
    intent: "organic",
    tier: "C",
    verdict: "HYPE DECAY",
    summary: "Viral peak then organic decline. No malice. No abandonment.",
    description:
      "The token had a real viral moment (ATH > $50k) driven by a narrative, KOL push, or trend. After the peak, organic sellers outweighed organic buyers and the chart bled out. No malicious cluster behavior — just the natural half-life of a meme.",
    signals: ["ath_mcap_usd>50000", "gradual_volume_decay", "no_malicious_dump"],
    autoPublishMinConfidence: 90,
  },
  {
    id: "organic_death",
    label: "Organic Death",
    intent: "organic",
    tier: "C",
    verdict: "ORGANIC DEATH",
    summary: "Small-cap that never grew. No malice, no abandonment.",
    description:
      "A micro-cap that never crossed $1k mcap and never had >$500 in liquidity. Ten people bought, nobody sold meaningfully, and the token simply fell off. We catalogue these only when the dev or funder appears in other patterns — the individual token is uninteresting.",
    signals: ["ath_mcap_usd<1000", "liquidity_usd<500", "no_malicious_dump"],
    autoPublishMinConfidence: 95,
  },

  {
    id: "unknown",
    label: "Unknown",
    intent: "neutral",
    tier: "C",
    verdict: "UNCLASSIFIED",
    summary: "Insufficient signals to classify cause of death.",
    description:
      "We don't yet have enough on-chain or social signal to confidently assign a death cause. Usually this means dev_behavior_scores didn't run, the creator wallet is missing, or the token is too new to have a behavioral fingerprint.",
    signals: [],
    autoPublishMinConfidence: 999,
  },
];

export const SOURCE_FEED_LABELS: Record<string, { label: string; description: string }> = {
  token_lifecycle: {
    label: "Lifecycle Floor",
    description: "Floor sweep: market cap < $1,000 OR liquidity < $500.",
  },
  pumpfun_watchlist: {
    label: "Pump.fun Watchlist",
    description: "Curated dead list — token marked status='dead' by the Pump.fun watcher.",
  },
  ath_collapsed: {
    label: "ATH Collapsed",
    description: "Had a 24h ATH > $50k but current mcap is now under 5% of that peak.",
  },
  admin_manual: {
    label: "Admin Manual",
    description: "Manually queued by an admin via the Super Admin queue.",
  },
};