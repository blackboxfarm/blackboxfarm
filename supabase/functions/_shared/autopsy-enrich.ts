/**
 * autopsy-enrich
 *
 * Populates the v2 enrichment columns on autopsy_candidates:
 *   social_completeness, x_community_member_count, telegram_subscriber_count,
 *   discord_present, youtube_url, boosts_paid_usd, dex_paid,
 *   holders_at_ath, dev_holding_pct_at_death.
 *
 * Pure DB pulls — no scrapes, no AI. Safe to call on every funnel insert.
 */

const SOCIAL_PLATFORMS = ['website', 'x', 'x_community', 'telegram', 'discord', 'youtube'];

function classifySocial(row: any): string | null {
  const platform = String(row?.platform ?? '').toLowerCase();
  const linkType = String(row?.link_type ?? '').toLowerCase();
  const url = String(row?.url ?? '').toLowerCase();
  const haystack = `${platform} ${linkType} ${url}`;

  if (row?.is_community || row?.community_id || /x\.com\/i\/communities\//.test(url)) return 'x_community';
  if (/telegram|t\.me\//.test(haystack)) return 'telegram';
  if (/discord|discord\.gg|discord\.com/.test(haystack)) return 'discord';
  if (/youtube|youtu\.be/.test(haystack)) return 'youtube';
  if (/twitter|\bx\b|x\.com\//.test(haystack)) return 'x';
  if (/website|site|homepage|http/.test(haystack)) return 'website';
  return null;
}

export interface EnrichResult {
  social_completeness: number;
  x_community_member_count: number | null;
  telegram_subscriber_count: number | null;
  discord_present: boolean;
  youtube_url: string | null;
  boosts_paid_usd: number | null;
  dex_paid: boolean | null;
  holders_at_ath: number | null;
  dev_holding_pct_at_death: number | null;
  boost_timeline?: Array<{ captured_at: string; total_amount: number | null; delta_amount: number | null; source: string }>;
  paid_orders?: Array<{ order_type: string; status: string | null; amount: number | null; payment_timestamp: string | null }>;
  vulture_summary?: {
    community_id: string | null;
    posts_scanned: number;
    vulture_count: number;
    sighting_count: number;
    vulture_handles: string[];
    scam_urls: string[];
    copypasta_groups: Array<{ handles: string[]; sample: string }>;
    mod_activity_seen: boolean | null;
    sampled_posts: Array<{ handle: string; vulture_kind: string; confidence: number; text: string; scam_urls: string[]; post_url: string | null }>;
  } | null;
  dissent_summary?: {
    community_id: string | null;
    posts_scanned: number;
    dissent_score: number;
    riot_threshold_met: boolean;
    counts: Record<string, number>;
    top_quotes: Array<{ kind: string; handle: string; quote: string; conf: number; post_url: string | null; posted_at: string | null }>;
    dev_handle: string | null;
    dev_last_post_in_community_at: string | null;
    dev_last_post_anywhere_at: string | null;
    days_since_dev_post_in_community: number | null;
    days_since_dev_post_anywhere: number | null;
  } | null;
}

export async function enrichCandidate(
  supabase: any,
  tokenMint: string,
  creatorWallet?: string | null,
): Promise<EnrichResult> {
  // ── socials ────────────────────────────────────────────────
  const { data: socials, error: socialsError } = await supabase
    .from('token_social_links')
    .select('platform, link_type, url, extracted_handle, is_community, community_id, is_current')
    .eq('token_mint', tokenMint)
    .neq('is_current', false);

  if (socialsError) console.warn('[autopsy-enrich] social link read failed:', socialsError.message);

  const platforms = new Set<string>();
  let youtubeUrl: string | null = null;
  let discordPresent = false;
  for (const s of socials ?? []) {
    const p = classifySocial(s);
    if (p && SOCIAL_PLATFORMS.includes(p)) platforms.add(p);
    if (p === 'youtube') youtubeUrl = s.url ?? null;
    if (p === 'discord') discordPresent = true;
  }
  const social_completeness = platforms.size;

  // ── X community member count ────────────────────────────────
  // token_social_links tells us that a community exists, but the current queue
  // table does not store member_count yet. Keep this unknown instead of faking 0.
  let xMembers: number | null = null;

  // ── Telegram subscriber count ───────────────────────────────
  let tgSubs: number | null = null;
  try {
    const { data: tgBlob } = await supabase
      .from('autopsy_evidence_blobs')
      .select('payload, captured_at')
      .eq('token_mint', tokenMint)
      .eq('kind', 'tg_deep_pull')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const count = Number(tgBlob?.payload?.getChatMemberCount?.result ?? NaN);
    if (Number.isFinite(count) && count > 0) tgSubs = count;
  } catch { /* ignore */ }

  // ── Paid boosts: live timeline from token_boost_history ────
  let boosts: number | null = null;
  let boostTimeline: EnrichResult['boost_timeline'] = [];
  try {
    const { data: bh } = await supabase
      .from('token_boost_history')
      .select('captured_at, total_amount, delta_amount, source')
      .eq('token_mint', tokenMint)
      .order('captured_at', { ascending: true });
    if (bh && bh.length > 0) {
      boostTimeline = bh as any;
      // Peak totalAmount across the timeline = lifetime boost tier reached
      const peak = bh.reduce((m: number, r: any) => Math.max(m, Number(r.total_amount ?? 0)), 0);
      boosts = peak || null;
    }
    // Manual admin entries still count as a fallback / override
    const { data: be } = await supabase
      .from('boost_entries')
      .select('amount, link_url')
      .ilike('link_url', `%${tokenMint}%`);
    if (be && be.length > 0) {
      const manual = be.reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);
      boosts = Math.max(boosts ?? 0, manual) || null;
    }
  } catch (e) { console.warn('[autopsy-enrich] boost history read failed:', (e as Error).message); }

  // ── DexScreener paid status from token_paid_orders ─────────
  let dexPaid: boolean | null = null;
  let paidOrders: EnrichResult['paid_orders'] = [];
  try {
    const { data: po } = await supabase
      .from('token_paid_orders')
      .select('order_type, status, amount, payment_timestamp')
      .eq('token_mint', tokenMint)
      .order('payment_timestamp', { ascending: true });
    if (po && po.length > 0) {
      paidOrders = po as any;
      dexPaid = po.some((o: any) => o.status === 'approved' && (o.order_type === 'tokenProfile' || o.order_type === 'communityTakeover'));
    }
  } catch (e) { console.warn('[autopsy-enrich] paid orders read failed:', (e as Error).message); }

  // ── Holders at ATH (closest snapshot) ──────────────────────
  let holdersAtAth: number | null = null;
  try {
    const { data: hist } = await supabase
      .from('holder_daily_summary')
      .select('total_holders, price_at_snapshot')
      .eq('token_mint', tokenMint)
      .order('total_holders', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hist) holdersAtAth = hist.total_holders ?? null;
  } catch { /* ignore */ }

  // ── Dev holdings at death ──────────────────────────────────
  let devHoldPct: number | null = null;
  if (creatorWallet) {
    try {
      const { data: db } = await supabase
        .from('dev_behavior_scores')
        .select('supply_retention_pct')
        .eq('wallet_address', creatorWallet)
        .maybeSingle();
      if (db) devHoldPct = db.supply_retention_pct ?? null;
    } catch { /* ignore */ }
  }

  // ── Vulture sweep summary (latest blob) ─────────────────────
  let vultureSummary: EnrichResult['vulture_summary'] = null;
  try {
    const { data: vBlob } = await supabase
      .from('autopsy_evidence_blobs')
      .select('payload, captured_at')
      .eq('token_mint', tokenMint)
      .eq('kind', 'vulture_sweep')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (vBlob?.payload) vultureSummary = vBlob.payload as any;
  } catch (e) { console.warn('[autopsy-enrich] vulture blob read failed:', (e as Error).message); }

  // ── Community dissent summary (latest blob) ─────────────────
  let dissentSummary: EnrichResult['dissent_summary'] = null;
  try {
    const { data: dBlob } = await supabase
      .from('autopsy_evidence_blobs')
      .select('payload, captured_at')
      .eq('token_mint', tokenMint)
      .eq('kind', 'community_dissent')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dBlob?.payload) dissentSummary = dBlob.payload as any;
  } catch (e) { console.warn('[autopsy-enrich] dissent blob read failed:', (e as Error).message); }

  return {
    social_completeness,
    x_community_member_count: xMembers,
    telegram_subscriber_count: tgSubs,
    discord_present: discordPresent,
    youtube_url: youtubeUrl,
    boosts_paid_usd: boosts,
    dex_paid: dexPaid,
    holders_at_ath: holdersAtAth,
    dev_holding_pct_at_death: devHoldPct,
    boost_timeline: boostTimeline,
    paid_orders: paidOrders,
    vulture_summary: vultureSummary,
    dissent_summary: dissentSummary,
  };
}