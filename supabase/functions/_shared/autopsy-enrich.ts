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

  // ── Paid boosts (sum) ───────────────────────────────────────
  let boosts: number | null = null;
  try {
    const { data: b } = await supabase
      .from('boost_entries')
      .select('amount, link_url')
      .ilike('link_url', `%${tokenMint}%`);
    if (b && b.length > 0) {
      boosts = b.reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);
    }
  } catch { /* ignore */ }

  // ── DexScreener paid status ────────────────────────────────
  let dexPaid: boolean | null = null;
  try {
    const { data: dp } = await supabase
      .from('dex_paid_status')
      .select('is_paid')
      .eq('token_mint', tokenMint)
      .maybeSingle();
    if (dp) dexPaid = !!dp.is_paid;
  } catch { /* ignore */ }

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
  };
}