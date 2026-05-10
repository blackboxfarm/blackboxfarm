import { createClient } from 'npm:@supabase/supabase-js@2';
import { meshFeed } from '../_shared/mesh-feeder.ts';
import { withRunLog } from '../_shared/run-logger.ts';
import { fetchDexScreenerData } from '../_shared/dexscreener-api.ts';
import { fetchLaunchpadCoin, detectLaunchpad, type LaunchpadCoin } from '../_shared/launchpad-fetch.ts';
import { normalizeTokenWebsite } from '../_shared/non-token-domains.ts';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { heliusRpcFetch } from '../_shared/helius-client.ts';
import { assertInsert, assertUpdate, assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const cleanText = (value: unknown): string | null => hasText(value) ? value.trim() : null;
const isMissing = (value: unknown) => !hasText(value) || ['???', 'UNKNOWN', 'Unknown', 'Unknown Token', 'UNK'].includes(String(value).trim());
const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const launchpadLabel = (lp: string | null | undefined): string | null => {
  if (lp === 'pumpfun') return 'pump.fun';
  if (lp === 'bagsfm') return 'bags.fm';
  if (lp === 'bonkfun') return 'bonk.fun';
  if (lp === 'meteora') return 'meteora';
  return null;
};

type TargetTable = 'scraped_tokens' | 'pumpfun_watchlist' | 'token_lifecycle' | 'holders_intel_seen_tokens' | 'funnel_feed_discoveries';
interface EnrichTarget { table: TargetTable; token: any; mint: string; }
interface HydratedFacts {
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  creatorWallet?: string | null;
  launchpad?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  websiteUrl?: string | null;
  discordUrl?: string | null;
  createdAt?: string | null;
  pairAddress?: string | null;
  dexId?: string | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  marketCapUsd?: number | null;
  fdv?: number | null;
  athMarketCapUsd?: number | null;
}

function rowSymbol(target: EnrichTarget): string | null {
  if (target.table === 'pumpfun_watchlist' || target.table === 'funnel_feed_discoveries') return target.token.token_symbol;
  return target.token.symbol;
}
function rowName(target: EnrichTarget): string | null {
  if (target.table === 'pumpfun_watchlist' || target.table === 'funnel_feed_discoveries') return target.token.token_name;
  return target.token.name;
}
function rowImage(target: EnrichTarget): string | null {
  if (target.table === 'holders_intel_seen_tokens') return target.token.image_uri;
  return target.token.image_url;
}
function rowDescription(target: EnrichTarget): string | null {
  return target.token.description ?? target.token.metadata?.description ?? null;
}
function rowLaunchpad(target: EnrichTarget): string | null {
  if (target.table === 'pumpfun_watchlist') return 'pump.fun';
  return target.token.launchpad ?? target.token.source ?? null;
}
function needsIdentity(target: EnrichTarget): boolean {
  return isMissing(rowSymbol(target)) || isMissing(rowName(target)) || !hasText(rowImage(target)) || !hasText(rowDescription(target));
}
function needsCreator(target: EnrichTarget): boolean {
  return !hasText(target.token.creator_wallet);
}
function needsLaunchpad(target: EnrichTarget): boolean {
  return !hasText(rowLaunchpad(target));
}
function needsSocials(target: EnrichTarget): boolean {
  return !hasText(target.token.twitter_url) || !hasText(target.token.telegram_url) || !hasText(target.token.website_url);
}
function setTextIfMissing(updates: Record<string, unknown>, column: string, current: unknown, value: unknown) {
  if (isMissing(current) && hasText(value)) updates[column] = value.trim();
}
function setNumberIfPositive(updates: Record<string, unknown>, column: string, value: unknown) {
  const n = asNumber(value);
  if (n !== null && n > 0) updates[column] = n;
}
function bestDexPair(dexResult: any): any | null {
  const pairs = Array.isArray(dexResult?.pairs) ? dexResult.pairs.filter((p: any) => p?.chainId === 'solana' || !p?.chainId) : [];
  if (pairs.length === 0) return null;
  return pairs.reduce((best: any, p: any) => (p?.liquidity?.usd || 0) > (best?.liquidity?.usd || 0) ? p : best, pairs[0]);
}
function normalizeSocialUrl(url: string | null | undefined, platform: 'twitter' | 'telegram' | 'discord' | 'website'): string | null {
  const v = cleanText(url);
  if (!v) return null;
  if (platform === 'twitter' && !v.startsWith('http')) return `https://x.com/${v.replace(/^@/, '')}`;
  if (platform === 'telegram' && !v.startsWith('http')) return `https://t.me/${v.replace(/^@/, '')}`;
  return v;
}
function socialMeta(url: string, fallback: string) {
  const lower = url.toLowerCase();
  const platform = lower.includes('x.com') || lower.includes('twitter.com') ? 'twitter'
    : lower.includes('t.me') || lower.includes('telegram.me') ? 'telegram'
    : lower.includes('discord.') ? 'discord'
    : fallback;
  const isCommunity = lower.includes('/communities/');
  const communityId = lower.match(/communities\/(\d+)/)?.[1] ?? null;
  const handleMatch = platform === 'twitter'
    ? lower.match(/(?:x\.com|twitter\.com)\/(@?[a-z0-9_]{1,20})/i)
    : platform === 'telegram'
      ? lower.match(/(?:t\.me|telegram\.me)\/([a-z0-9_]{1,64})/i)
      : null;
  const extractedHandle = communityId ?? (handleMatch?.[1]?.replace('@', '') ?? null);
  const linkType = isCommunity ? 'x_community' : platform === 'twitter' ? 'twitter' : platform;
  return { platform, isCommunity, communityId, extractedHandle, linkType };
}

async function captureWebsite(supabaseClient: any, mint: string, rawUrl: string | null | undefined, source: string) {
  const normalized = normalizeTokenWebsite(rawUrl);
  if (!normalized) return;
  await assertUpsert(
    supabaseClient
      .from('token_website_sources')
      .upsert(
        { token_mint: mint, url: normalized.url, host: normalized.host, source: source === 'dexscreener' ? 'dexscreener_paid' : 'launchpad' },
        { onConflict: 'token_mint,url,source', ignoreDuplicates: true }
      ),
    'token_website_sources',
  );
}

async function captureSocialLinks(supabaseClient: any, mint: string, facts: HydratedFacts, source: string) {
  const entries = [
    { url: normalizeSocialUrl(facts.twitterUrl, 'twitter'), fallback: 'twitter' },
    { url: normalizeSocialUrl(facts.telegramUrl, 'telegram'), fallback: 'telegram' },
    { url: normalizeSocialUrl(facts.websiteUrl, 'website'), fallback: 'website' },
    { url: normalizeSocialUrl(facts.discordUrl, 'discord'), fallback: 'discord' },
  ].filter((e): e is { url: string; fallback: string } => hasText(e.url));
  if (entries.length === 0) return;
  const rows = entries.map(e => {
    const meta = socialMeta(e.url, e.fallback);
    return {
      token_mint: mint,
      url: e.url,
      source,
      platform: meta.platform,
      link_type: meta.linkType,
      extracted_handle: meta.extractedHandle,
      is_community: meta.isCommunity,
      community_id: meta.communityId,
      is_current: true,
      phase: 'mint_discovery',
    };
  });
  await assertUpsert(
    supabaseClient.from('token_social_links').upsert(rows, { onConflict: 'token_mint,url,source', ignoreDuplicates: true }),
    'token_social_links',
  );
}

function factsFromLaunchpad(data: LaunchpadCoin): HydratedFacts {
  return {
    symbol: data.symbol,
    name: data.name,
    imageUrl: data.imageUri,
    description: data.description,
    creatorWallet: data.creator,
    launchpad: launchpadLabel(data.launchpad),
    twitterUrl: normalizeSocialUrl(data.twitter, 'twitter'),
    telegramUrl: normalizeSocialUrl(data.telegram, 'telegram'),
    websiteUrl: normalizeSocialUrl(data.website, 'website'),
    discordUrl: normalizeSocialUrl(data.discord, 'discord'),
    createdAt: data.createdAt,
    marketCapUsd: data.marketCapUsd,
    athMarketCapUsd: data.athMarketCapUsd,
  };
}
function factsFromDex(dexResult: any, pair: any, mint: string): HydratedFacts {
  return {
    symbol: pair?.baseToken?.symbol,
    name: pair?.baseToken?.name,
    imageUrl: pair?.info?.imageUrl,
    launchpad: dexResult?.launchpadInfo?.detected ? dexResult.launchpadInfo.name : launchpadLabel(detectLaunchpad(mint)),
    twitterUrl: normalizeSocialUrl(dexResult?.socials?.twitter, 'twitter'),
    telegramUrl: normalizeSocialUrl(dexResult?.socials?.telegram, 'telegram'),
    websiteUrl: normalizeSocialUrl(dexResult?.socials?.website, 'website'),
    createdAt: pair?.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
    pairAddress: pair?.pairAddress,
    dexId: pair?.dexId,
    priceUsd: asNumber(dexResult?.priceUsd || pair?.priceUsd),
    liquidityUsd: asNumber(dexResult?.vitality?.liquidityUsd ?? pair?.liquidity?.usd),
    marketCapUsd: asNumber(pair?.marketCap ?? pair?.fdv),
    fdv: asNumber(pair?.fdv),
  };
}
async function factsFromHelius(mint: string): Promise<HydratedFacts> {
  try {
    const data = await heliusRpcFetch('getAsset', { id: mint }, { timeoutMs: 9000 });
    const asset = data?.result;
    return {
      symbol: asset?.content?.metadata?.symbol,
      name: asset?.content?.metadata?.name,
      imageUrl: asset?.content?.links?.image || asset?.content?.files?.[0]?.uri,
      description: asset?.content?.metadata?.description,
      creatorWallet: asset?.authorities?.[0]?.address || asset?.creators?.find((c: any) => c?.verified || c?.share === 100)?.address,
    };
  } catch {
    return {};
  }
}
function mergeFacts(base: HydratedFacts, extra: HydratedFacts): HydratedFacts {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if ((out as any)[key] === undefined || (out as any)[key] === null || (typeof (out as any)[key] === 'string' && !(out as any)[key].trim())) {
      (out as any)[key] = value as any;
    }
  }
  return out;
}

function applyFacts(target: EnrichTarget, updates: Record<string, unknown>, facts: HydratedFacts) {
  const now = new Date().toISOString();
  const currentDescription = rowDescription(target);
  const currentLaunchpad = rowLaunchpad(target);

  if (target.table === 'scraped_tokens') {
    setTextIfMissing(updates, 'symbol', target.token.symbol, facts.symbol);
    setTextIfMissing(updates, 'name', target.token.name, facts.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, facts.imageUrl);
    setTextIfMissing(updates, 'description', currentDescription, facts.description);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, facts.creatorWallet);
    setTextIfMissing(updates, 'launchpad', currentLaunchpad, facts.launchpad);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, facts.twitterUrl);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, facts.telegramUrl);
    setTextIfMissing(updates, 'website_url', target.token.website_url, facts.websiteUrl);
    if (facts.creatorWallet || target.token.creator_wallet) updates.creator_fetched_at = now;
    if (facts.symbol || facts.name || facts.imageUrl || facts.description) updates.metadata_fetched_at = now;
  } else if (target.table === 'pumpfun_watchlist') {
    setTextIfMissing(updates, 'token_symbol', target.token.token_symbol, facts.symbol);
    setTextIfMissing(updates, 'token_name', target.token.token_name, facts.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, facts.imageUrl);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, facts.creatorWallet);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, facts.twitterUrl);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, facts.telegramUrl);
    setTextIfMissing(updates, 'website_url', target.token.website_url, facts.websiteUrl);
    if (facts.createdAt && !target.token.created_at_blockchain) updates.created_at_blockchain = facts.createdAt;
    setNumberIfPositive(updates, 'market_cap_usd', facts.marketCapUsd);
    setNumberIfPositive(updates, 'ath_market_cap_usd', facts.athMarketCapUsd);
    setNumberIfPositive(updates, 'price_usd', facts.priceUsd);
    setNumberIfPositive(updates, 'price_current', facts.priceUsd);
    setNumberIfPositive(updates, 'liquidity_usd', facts.liquidityUsd);
    if (facts.pairAddress && !target.token.raydium_pool_address) updates.raydium_pool_address = facts.pairAddress;
    if (facts.athMarketCapUsd && !target.token.ath_market_cap_at) updates.ath_market_cap_at = now;
    if (facts.imageUrl) updates.has_image = true;
    const socialsCount = [facts.twitterUrl, facts.telegramUrl, facts.websiteUrl, facts.discordUrl].filter(hasText).length;
    if (socialsCount > (target.token.socials_count ?? 0)) updates.socials_count = socialsCount;
    updates.last_checked_at = now;
    updates.last_processor = 'enrich-scraped-tokens';
    updates.metadata = {
      ...(target.token.metadata ?? {}),
      launchpad: facts.launchpad ?? target.token.metadata?.launchpad ?? 'pump.fun',
      description: facts.description ?? target.token.metadata?.description ?? null,
      discord: facts.discordUrl ?? target.token.metadata?.discord ?? null,
      metadata_fetched_at: now,
    };
  } else if (target.table === 'token_lifecycle') {
    setTextIfMissing(updates, 'symbol', target.token.symbol, facts.symbol);
    setTextIfMissing(updates, 'name', target.token.name, facts.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, facts.imageUrl);
    setTextIfMissing(updates, 'description', currentDescription, facts.description);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, facts.creatorWallet);
    setTextIfMissing(updates, 'launchpad', currentLaunchpad, facts.launchpad);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, facts.twitterUrl);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, facts.telegramUrl);
    setTextIfMissing(updates, 'website_url', target.token.website_url, facts.websiteUrl);
    setTextIfMissing(updates, 'pair_address', target.token.pair_address, facts.pairAddress);
    setTextIfMissing(updates, 'dex_id', target.token.dex_id, facts.dexId);
    if (facts.createdAt && !target.token.pair_created_at) updates.pair_created_at = facts.createdAt;
    setNumberIfPositive(updates, 'price_usd', facts.priceUsd);
    setNumberIfPositive(updates, 'liquidity_usd', facts.liquidityUsd);
    setNumberIfPositive(updates, 'market_cap', facts.marketCapUsd);
    setNumberIfPositive(updates, 'fdv', facts.fdv);
    updates.last_fetched_at = now;
    updates.metadata = { ...(target.token.metadata ?? {}), description: facts.description ?? target.token.metadata?.description ?? null, metadata_fetched_at: now };
  } else if (target.table === 'holders_intel_seen_tokens') {
    setTextIfMissing(updates, 'symbol', target.token.symbol, facts.symbol);
    setTextIfMissing(updates, 'name', target.token.name, facts.name);
    setTextIfMissing(updates, 'image_uri', target.token.image_uri, facts.imageUrl);
    setTextIfMissing(updates, 'description', currentDescription, facts.description);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, facts.creatorWallet);
    setTextIfMissing(updates, 'launchpad', currentLaunchpad, facts.launchpad);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, facts.twitterUrl);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, facts.telegramUrl);
    setTextIfMissing(updates, 'website_url', target.token.website_url, facts.websiteUrl);
    if (facts.createdAt && !target.token.minted_at) updates.minted_at = facts.createdAt;
    if (facts.marketCapUsd) updates.market_cap_at_discovery = facts.marketCapUsd;
    if (facts.creatorWallet || target.token.creator_wallet) updates.creator_fetched_at = now;
    if (facts.symbol || facts.name || facts.imageUrl || facts.description) updates.metadata_fetched_at = now;
    updates.last_seen_at = now;
  } else if (target.table === 'funnel_feed_discoveries') {
    setTextIfMissing(updates, 'token_symbol', target.token.token_symbol, facts.symbol);
    setTextIfMissing(updates, 'token_name', target.token.token_name, facts.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, facts.imageUrl);
    setTextIfMissing(updates, 'description', currentDescription, facts.description);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, facts.creatorWallet);
    setTextIfMissing(updates, 'launchpad', currentLaunchpad, facts.launchpad);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, facts.twitterUrl);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, facts.telegramUrl);
    setTextIfMissing(updates, 'website_url', target.token.website_url, facts.websiteUrl);
    if (facts.creatorWallet || target.token.creator_wallet) updates.creator_fetched_at = now;
    if (facts.symbol || facts.name || facts.imageUrl || facts.description) updates.metadata_fetched_at = now;
    updates.dex_data = { ...(target.token.dex_data ?? {}), metadata: { symbol: facts.symbol, name: facts.name, imageUrl: facts.imageUrl, description: facts.description, launchpad: facts.launchpad } };
  }
}

async function pushDerivativeWrites(supabaseClient: any, target: EnrichTarget, facts: HydratedFacts, provider: string) {
  await captureWebsite(supabaseClient, target.mint, facts.websiteUrl, provider);
  await captureSocialLinks(supabaseClient, target.mint, facts, provider);
  const creator = cleanText(facts.creatorWallet ?? target.token.creator_wallet);
  if (creator) {
    const { data: existingProfile, error: profileReadError } = await supabaseClient
      .from('developer_profiles')
      .select('id')
      .eq('master_wallet_address', creator)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (profileReadError) throw profileReadError;

    let profile = existingProfile;
    if (profile?.id) {
      await assertUpdate(
        supabaseClient.from('developer_profiles').update({
          source: 'mint_hydrator',
          metadata: { seeded_from_token: target.mint, provider },
          updated_at: new Date().toISOString(),
        }).eq('id', profile.id),
        'developer_profiles',
      );
    } else {
      const inserted = await assertInsert(
        supabaseClient.from('developer_profiles').insert({
          master_wallet_address: creator,
          display_name: creator.slice(0, 8),
          source: 'mint_hydrator',
          kyc_verified: false,
          trust_level: 'neutral',
          metadata: { seeded_from_token: target.mint, provider },
        }).select('id').single(),
        'developer_profiles',
      );
      profile = inserted;
    }

    if (profile?.id) {
      const { data: existingDevToken, error: existingError } = await supabaseClient
        .from('developer_tokens')
        .select('id')
        .eq('token_mint', target.mint)
        .maybeSingle();
      if (existingError) throw existingError;

      const devTokenRow = {
        developer_id: profile.id,
        token_mint: target.mint,
        creator_wallet: creator,
        launchpad: facts.launchpad ?? rowLaunchpad(target),
        launch_date: facts.createdAt ?? target.token.created_at_blockchain ?? target.token.pair_created_at ?? target.token.first_seen_at ?? null,
        current_market_cap_usd: facts.marketCapUsd ?? null,
        notes: `Auto-hydrated from mint via ${provider}`,
        updated_at: new Date().toISOString(),
      };

      if (existingDevToken?.id) {
        await assertUpdate(
          supabaseClient.from('developer_tokens').update(devTokenRow).eq('id', existingDevToken.id),
          'developer_tokens',
        );
      } else {
        await assertUpsert(
          supabaseClient.from('developer_tokens').upsert(devTokenRow, { onConflict: 'developer_id,token_mint', ignoreDuplicates: false }),
          'developer_tokens',
        );
      }
    }
  }
}

async function buildTargets(supabaseClient: any, tokenMints: string[], batchSize: number): Promise<EnrichTarget[]> {
  const hasExplicitMints = tokenMints.length > 0;
  const targets: EnrichTarget[] = [];
  const addRows = (table: TargetTable, rows: any[] | null) => {
    for (const token of rows ?? []) {
      if (hasText(token.token_mint) && !targets.some(t => t.table === table && t.mint === token.token_mint)) {
        targets.push({ table, token, mint: token.token_mint });
      }
    }
  };

  // Keep gap filters narrow — we rely on partial indexes (idx_*_metadata_gaps) and broad NULL checks
  // on a few widely-missing columns. Avoid huge OR predicates that blow past statement_timeout.
  const specs: Array<{ table: TargetTable; select: string; gaps: string }> = [
    { table: 'scraped_tokens',           select: '*', gaps: 'creator_wallet.is.null,symbol.is.null,name.is.null,image_url.is.null,launchpad.is.null' },
    { table: 'pumpfun_watchlist',        select: '*', gaps: 'creator_wallet.is.null,token_symbol.is.null,token_name.is.null,image_url.is.null' },
    { table: 'token_lifecycle',          select: '*', gaps: 'creator_wallet.is.null,symbol.is.null,name.is.null,image_url.is.null,launchpad.is.null' },
    { table: 'holders_intel_seen_tokens',select: '*', gaps: 'creator_wallet.is.null,symbol.is.null,name.is.null,image_uri.is.null,launchpad.is.null' },
    { table: 'funnel_feed_discoveries',  select: '*', gaps: 'creator_wallet.is.null,token_symbol.is.null,token_name.is.null,image_url.is.null,launchpad.is.null' },
  ];

  const perTableLimit = Math.max(1, Math.ceil(batchSize / specs.length));
  for (const spec of specs) {
    let query = supabaseClient.from(spec.table).select(spec.select).limit(hasExplicitMints ? Math.min(tokenMints.length, 100) : perTableLimit);
    if (hasExplicitMints) query = query.in('token_mint', tokenMints);
    else query = query.or(spec.gaps);
    const { data, error } = await query;
    if (error) throw error;
    addRows(spec.table, data);
  }

  return targets.slice(0, batchSize);
}

Deno.serve(withRunLog('enrich-scraped-tokens', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tokenMints: string[] = Array.isArray(body.tokenMints)
      ? [...new Set(body.tokenMints.map((m: unknown) => String(m).trim()).filter(hasText))] as string[]
      : [];
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 50);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const targets = await buildTargets(supabaseClient, tokenMints, batchSize);
    if (targets.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens need enrichment', enriched: 0, total: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    console.log(`Enriching ${targets.length} token rows across all source tables...`);
    const launchpadCache = new Map<string, Awaited<ReturnType<typeof fetchLaunchpadCoin>>>();
    const dexCache = new Map<string, Awaited<ReturnType<typeof fetchDexScreenerData>>>();
    const heliusCache = new Map<string, HydratedFacts>();
    const creatorCache = new Map<string, Awaited<ReturnType<typeof resolveTokenCreator>>>();
    let enrichedCount = 0;
    const byTable: Record<TargetTable, number> = { scraped_tokens: 0, pumpfun_watchlist: 0, token_lifecycle: 0, holders_intel_seen_tokens: 0, funnel_feed_discoveries: 0 };
    const results: any[] = [];

    for (const target of targets) {
      try {
        const providerNotes: string[] = [];
        let facts: HydratedFacts = {};

        if (detectLaunchpad(target.mint) !== 'unknown' || needsIdentity(target) || needsCreator(target) || needsLaunchpad(target) || needsSocials(target)) {
          let lp = launchpadCache.get(target.mint);
          if (!lp) {
            lp = await fetchLaunchpadCoin(target.mint, 'enrich-scraped-tokens');
            launchpadCache.set(target.mint, lp);
          }
          if (lp.data) {
            facts = mergeFacts(facts, factsFromLaunchpad(lp.data));
            providerNotes.push(`launchpad:${lp.data.launchpad}`);
          } else {
            const suffixLaunchpad = launchpadLabel(lp.launchpad);
            if (suffixLaunchpad) facts.launchpad = suffixLaunchpad;
            providerNotes.push(`launchpad_empty:${lp.launchpad}:${lp.reason ?? 'no_reason'}`);
          }
        }

        if (needsIdentity(target) || needsLaunchpad(target) || needsSocials(target) || target.table === 'pumpfun_watchlist' || target.table === 'token_lifecycle') {
          let dex = dexCache.get(target.mint);
          if (!dex) {
            dex = await fetchDexScreenerData(target.mint);
            dexCache.set(target.mint, dex);
          }
          const pair = bestDexPair(dex);
          if (pair) {
            facts = mergeFacts(facts, factsFromDex(dex, pair, target.mint));
            providerNotes.push('dexscreener');
          } else {
            providerNotes.push('dexscreener_empty');
          }
        }

        if (needsIdentity(target) || needsCreator(target)) {
          let heliusFacts = heliusCache.get(target.mint);
          if (!heliusFacts) {
            heliusFacts = await factsFromHelius(target.mint);
            heliusCache.set(target.mint, heliusFacts);
          }
          if (Object.keys(heliusFacts).length > 0) {
            facts = mergeFacts(facts, heliusFacts);
            providerNotes.push('helius_das');
          }
        }

        if (needsCreator(target) && !hasText(facts.creatorWallet)) {
          const errors: string[] = [];
          let resolved = creatorCache.get(target.mint);
          if (!resolved) {
            resolved = await resolveTokenCreator(target.mint, supabaseClient, errors);
            creatorCache.set(target.mint, resolved);
          }
          if (resolved.creatorWallet) {
            facts.creatorWallet = resolved.creatorWallet;
            providerNotes.push(`creator:${resolved.source}`);
          } else {
            providerNotes.push(`creator_empty:${[...errors, ...resolved.errors].join('|') || 'no_source'}`);
          }
        }

        const updates: Record<string, unknown> = {};
        applyFacts(target, updates, facts);

        if (Object.keys(updates).length > 0) {
          await assertUpdate(
            supabaseClient.from(target.table).update(updates).eq('token_mint', target.mint),
            target.table,
          );
          await pushDerivativeWrites(supabaseClient, target, facts, providerNotes.find(p => !p.includes('_empty'))?.split(':')[0] ?? 'mint_hydrator');
          enrichedCount++;
          byTable[target.table]++;

          meshFeed.token(supabaseClient, {
            mint: target.mint,
            symbol: String(facts.symbol ?? updates.symbol ?? updates.token_symbol ?? rowSymbol(target) ?? ''),
            name: String(facts.name ?? updates.name ?? updates.token_name ?? rowName(target) ?? ''),
            creatorWallet: String(facts.creatorWallet ?? updates.creator_wallet ?? target.token.creator_wallet ?? ''),
            twitterUrl: String(facts.twitterUrl ?? updates.twitter_url ?? target.token.twitter_url ?? ''),
            telegramUrl: String(facts.telegramUrl ?? updates.telegram_url ?? target.token.telegram_url ?? ''),
            websiteUrl: String(facts.websiteUrl ?? updates.website_url ?? target.token.website_url ?? ''),
            source: 'enrich-scraped-tokens',
          }).catch(e => console.warn('[mesh-feeder] enrich feed failed:', e));
        }

        results.push({ token_mint: target.mint, table: target.table, success: Object.keys(updates).length > 0, updates, facts, providers: providerNotes, reason: Object.keys(updates).length > 0 ? undefined : 'no_provider_data_returned' });
      } catch (error) {
        if ((error as any)?.name === 'DbWriteError') throw error;
        console.error(`Error enriching ${target.table} ${target.mint}:`, error);
        results.push({ token_mint: target.mint, table: target.table, success: false, error: (error as Error).message });
      }
      await delay(200);
    }

    if (enrichedCount > 0) {
      const { error: refreshError } = await supabaseClient.rpc('refresh_master_token_directory');
      if (refreshError) throw refreshError;
    }

    return new Response(
      JSON.stringify({ message: `Enriched ${enrichedCount} of ${targets.length} token rows`, enriched: enrichedCount, total: targets.length, byTable, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in enrich-scraped-tokens:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
}));
