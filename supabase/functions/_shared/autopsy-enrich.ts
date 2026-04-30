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

const SOCIAL_PLATFORMS = ['website', 'twitter', 'x', 'x_community', 'telegram', 'discord', 'youtube'];

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
  const { data: socials } = await supabase
    .from('token_social_links')
    .select('platform, url, handle')
    .eq('token_mint', tokenMint);

  const platforms = new Set<string>();
  let youtubeUrl: string | null = null;
  let discordPresent = false;
  for (const s of socials ?? []) {
    const p = (s.platform || '').toLowerCase();
    if (SOCIAL_PLATFORMS.includes(p)) platforms.add(p === 'twitter' ? 'x' : p);
    if (p === 'youtube') youtubeUrl = s.url ?? null;
    if (p === 'discord') discordPresent = true;
  }
  const social_completeness = platforms.size;

  // ── X community member count (best-effort from registry) ───
  let xMembers: number | null = null;
  try {
    const { data: xc } = await supabase
      .from('x_community_resolution_queue')
      .select('member_count')
      .eq('token_mint', tokenMint)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    xMembers = (xc?.member_count as number | null) ?? null;
  } catch { /* table may not have this column in all envs */ }

  // ── Telegram subscriber count ───────────────────────────────
  let tgSubs: number | null = null;
  try {
    const { data: tg } = await supabase
      .from('telegram_channel_registry')
      .select('member_count, subscriber_count')
      .eq('token_mint', tokenMint)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    tgSubs = (tg?.subscriber_count ?? tg?.member_count ?? null) as number | null;
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