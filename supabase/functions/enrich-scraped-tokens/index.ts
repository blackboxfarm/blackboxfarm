import { createClient } from 'npm:@supabase/supabase-js@2';
import { meshFeed } from '../_shared/mesh-feeder.ts';
import { withRunLog } from '../_shared/run-logger.ts';
import { fetchDexScreenerData } from '../_shared/dexscreener-api.ts';
import { fetchLaunchpadCoin, detectLaunchpad, type LaunchpadCoin } from '../_shared/launchpad-fetch.ts';
import { normalizeTokenWebsite } from '../_shared/non-token-domains.ts';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { assertUpdate, assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
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

type TargetTable = 'scraped_tokens' | 'pumpfun_watchlist';
interface EnrichTarget { table: TargetTable; token: any; mint: string; }

function rowSymbol(target: EnrichTarget): string | null {
  return target.table === 'scraped_tokens' ? target.token.symbol : target.token.token_symbol;
}
function rowName(target: EnrichTarget): string | null {
  return target.table === 'scraped_tokens' ? target.token.name : target.token.token_name;
}
function needsIdentity(target: EnrichTarget): boolean {
  return !hasText(rowSymbol(target)) || !hasText(rowName(target)) || !hasText(target.token.image_url);
}
function needsCreator(target: EnrichTarget): boolean {
  return !hasText(target.token.creator_wallet);
}
function needsLaunchpad(target: EnrichTarget): boolean {
  return target.table === 'scraped_tokens' && !hasText(target.token.launchpad);
}
function setTextIfMissing(updates: Record<string, unknown>, column: string, current: unknown, value: unknown) {
  if (!hasText(current) && hasText(value)) updates[column] = value.trim();
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

async function captureWebsite(supabaseClient: any, mint: string, rawUrl: string | null | undefined, source: string) {
  const normalized = normalizeTokenWebsite(rawUrl);
  if (!normalized) return;
  await assertUpsert(
    supabaseClient
      .from('token_website_sources')
      .upsert(
        { token_mint: mint, url: normalized.url, host: normalized.host, source },
        { onConflict: 'token_mint,url,source', ignoreDuplicates: true }
      ),
    'token_website_sources',
  );
}

function applyLaunchpadData(target: EnrichTarget, updates: Record<string, unknown>, data: LaunchpadCoin) {
  const now = new Date().toISOString();
  if (target.table === 'scraped_tokens') {
    setTextIfMissing(updates, 'symbol', target.token.symbol, data.symbol);
    setTextIfMissing(updates, 'name', target.token.name, data.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, data.imageUri);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, data.creator);
    setTextIfMissing(updates, 'launchpad', target.token.launchpad, launchpadLabel(data.launchpad));
    if (hasText(data.creator) || hasText(target.token.creator_wallet)) updates.creator_fetched_at = now;
    if (hasText(data.symbol) || hasText(data.name) || hasText(data.imageUri)) updates.metadata_fetched_at = now;
  } else {
    setTextIfMissing(updates, 'token_symbol', target.token.token_symbol, data.symbol);
    setTextIfMissing(updates, 'token_name', target.token.token_name, data.name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, data.imageUri);
    setTextIfMissing(updates, 'creator_wallet', target.token.creator_wallet, data.creator);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, data.twitter);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, data.telegram);
    setTextIfMissing(updates, 'website_url', target.token.website_url, data.website);
    if (data.createdAt && !target.token.created_at_blockchain) updates.created_at_blockchain = data.createdAt;
    setNumberIfPositive(updates, 'market_cap_usd', data.marketCapUsd);
    setNumberIfPositive(updates, 'ath_market_cap_usd', data.athMarketCapUsd);
    if (asNumber(data.athMarketCapUsd) && !target.token.ath_market_cap_at) updates.ath_market_cap_at = now;
    if (hasText(data.imageUri)) updates.has_image = true;
    const socialsCount = [data.twitter, data.telegram, data.website, data.discord].filter(hasText).length;
    if (socialsCount > (target.token.socials_count ?? 0)) updates.socials_count = socialsCount;
    updates.last_checked_at = now;
    updates.last_processor = 'enrich-scraped-tokens';
    updates.metadata = {
      ...(target.token.metadata ?? {}),
      launchpad: data.launchpad,
      description: data.description ?? (target.token.metadata?.description ?? null),
      discord: data.discord ?? (target.token.metadata?.discord ?? null),
      launchpad_raw_present: !!data.raw,
      launchpad_fetched_at: now,
    };
  }
}

function applyDexData(target: EnrichTarget, updates: Record<string, unknown>, dexResult: any, pair: any) {
  const now = new Date().toISOString();
  const symbol = pair?.baseToken?.symbol;
  const name = pair?.baseToken?.name;
  const imageUrl = pair?.info?.imageUrl;
  const marketCap = pair?.marketCap ?? pair?.fdv;
  const priceUsd = dexResult?.priceUsd || pair?.priceUsd;
  const liquidityUsd = dexResult?.vitality?.liquidityUsd ?? pair?.liquidity?.usd;
  const pairCreatedAt = pair?.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null;

  if (target.table === 'scraped_tokens') {
    setTextIfMissing(updates, 'symbol', target.token.symbol, symbol);
    setTextIfMissing(updates, 'name', target.token.name, name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, imageUrl);
    if (pairCreatedAt && !target.token.raydium_date) updates.raydium_date = pairCreatedAt;
    if (!hasText(target.token.launchpad)) {
      const dexLaunchpad = dexResult?.launchpadInfo?.detected ? dexResult.launchpadInfo.name : launchpadLabel(detectLaunchpad(target.mint));
      if (hasText(dexLaunchpad)) updates.launchpad = dexLaunchpad;
    }
    if (hasText(symbol) || hasText(name) || hasText(imageUrl)) updates.metadata_fetched_at = now;
  } else {
    setTextIfMissing(updates, 'token_symbol', target.token.token_symbol, symbol);
    setTextIfMissing(updates, 'token_name', target.token.token_name, name);
    setTextIfMissing(updates, 'image_url', target.token.image_url, imageUrl);
    setTextIfMissing(updates, 'twitter_url', target.token.twitter_url, dexResult?.socials?.twitter);
    setTextIfMissing(updates, 'telegram_url', target.token.telegram_url, dexResult?.socials?.telegram);
    setTextIfMissing(updates, 'website_url', target.token.website_url, dexResult?.socials?.website);
    if (pairCreatedAt && !target.token.created_at_blockchain) updates.created_at_blockchain = pairCreatedAt;
    setTextIfMissing(updates, 'raydium_pool_address', target.token.raydium_pool_address, pair?.pairAddress);
    setNumberIfPositive(updates, 'price_usd', priceUsd);
    setNumberIfPositive(updates, 'price_current', priceUsd);
    setNumberIfPositive(updates, 'market_cap_usd', marketCap);
    setNumberIfPositive(updates, 'liquidity_usd', liquidityUsd);
    if (hasText(imageUrl)) updates.has_image = true;
    updates.last_checked_at = now;
    updates.last_processor = 'enrich-scraped-tokens';
    updates.metadata = {
      ...(target.token.metadata ?? {}),
      dexscreener: {
        pairAddress: pair?.pairAddress ?? null,
        dexId: pair?.dexId ?? null,
        url: pair?.url ?? null,
        fetchedAt: now,
      },
    };
  }
}

async function buildTargets(supabaseClient: any, tokenMints: string[], batchSize: number): Promise<EnrichTarget[]> {
  const hasExplicitMints = tokenMints.length > 0;
  const targets: EnrichTarget[] = [];

  let scrapedQuery = supabaseClient.from('scraped_tokens').select('*').limit(batchSize);
  if (hasExplicitMints) {
    scrapedQuery = scrapedQuery.in('token_mint', tokenMints);
  } else {
    scrapedQuery = scrapedQuery.or('metadata_fetched_at.is.null,creator_fetched_at.is.null,symbol.is.null,symbol.eq.,name.is.null,name.eq.,image_url.is.null,image_url.eq.,launchpad.is.null,launchpad.eq.,creator_wallet.is.null,creator_wallet.eq.');
  }
  const { data: scrapedTokens, error: scrapedError } = await scrapedQuery;
  if (scrapedError) throw scrapedError;
  for (const token of scrapedTokens ?? []) {
    if (hasText(token.token_mint)) targets.push({ table: 'scraped_tokens', token, mint: token.token_mint });
  }

  let watchlistQuery = supabaseClient.from('pumpfun_watchlist').select('*').limit(batchSize);
  if (hasExplicitMints) {
    watchlistQuery = watchlistQuery.in('token_mint', tokenMints);
  } else {
    watchlistQuery = watchlistQuery.or('token_symbol.is.null,token_symbol.eq.,token_name.is.null,token_name.eq.,image_url.is.null,image_url.eq.,creator_wallet.is.null,creator_wallet.eq.,created_at_blockchain.is.null');
  }
  const { data: watchlistTokens, error: watchlistError } = await watchlistQuery;
  if (watchlistError) throw watchlistError;
  for (const token of watchlistTokens ?? []) {
    if (hasText(token.token_mint)) targets.push({ table: 'pumpfun_watchlist', token, mint: token.token_mint });
  }

  return targets;
}

Deno.serve(withRunLog('enrich-scraped-tokens', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tokenMints = Array.isArray(body.tokenMints)
      ? [...new Set(body.tokenMints.map((m: unknown) => String(m).trim()).filter(hasText))]
      : [];
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 25);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const targets = await buildTargets(supabaseClient, tokenMints, batchSize);
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tokens need enrichment', enriched: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Enriching ${targets.length} token rows across scraped_tokens + pumpfun_watchlist...`);

    const launchpadCache = new Map<string, Awaited<ReturnType<typeof fetchLaunchpadCoin>>>();
    const dexCache = new Map<string, Awaited<ReturnType<typeof fetchDexScreenerData>>>();
    let enrichedCount = 0;
    const byTable: Record<TargetTable, number> = { scraped_tokens: 0, pumpfun_watchlist: 0 };
    const results: any[] = [];

    for (const target of targets) {
      try {
        const updates: Record<string, unknown> = {};
        const providerNotes: string[] = [];
        const shouldFetchLaunchpad = detectLaunchpad(target.mint) !== 'unknown' && (needsIdentity(target) || needsCreator(target) || needsLaunchpad(target));

        if (shouldFetchLaunchpad) {
          let lp = launchpadCache.get(target.mint);
          if (!lp) {
            lp = await fetchLaunchpadCoin(target.mint, 'enrich-scraped-tokens');
            launchpadCache.set(target.mint, lp);
          }
          if (lp.data) {
            applyLaunchpadData(target, updates, lp.data);
            await captureWebsite(supabaseClient, target.mint, lp.data.website, 'launchpad');
            providerNotes.push(`launchpad:${lp.data.launchpad}`);
          } else {
            providerNotes.push(`launchpad_empty:${lp.launchpad}:${lp.reason ?? 'no_reason'}`);
          }
        }

        if (needsIdentity(target) || target.table === 'pumpfun_watchlist') {
          let dex = dexCache.get(target.mint);
          if (!dex) {
            dex = await fetchDexScreenerData(target.mint);
            dexCache.set(target.mint, dex);
          }
          const pair = bestDexPair(dex);
          if (pair) {
            applyDexData(target, updates, dex, pair);
            await captureWebsite(supabaseClient, target.mint, dex.socials?.website, 'dexscreener');
            providerNotes.push('dexscreener');
          } else {
            providerNotes.push('dexscreener_empty');
          }
        }

        if (needsCreator(target) && !hasText(updates.creator_wallet)) {
          const errors: string[] = [];
          const resolved = await resolveTokenCreator(target.mint, supabaseClient, errors);
          if (resolved.creatorWallet) {
            updates.creator_wallet = resolved.creatorWallet;
            if (target.table === 'scraped_tokens') updates.creator_fetched_at = new Date().toISOString();
            providerNotes.push(`creator:${resolved.source}`);
          } else {
            providerNotes.push(`creator_empty:${errors.join('|') || 'no_source'}`);
          }
        }

        if (Object.keys(updates).length > 0) {
          await assertUpdate(
            supabaseClient
              .from(target.table)
              .update(updates)
              .eq('token_mint', target.mint),
            target.table,
          );
          enrichedCount++;
          byTable[target.table]++;

          meshFeed.token(supabaseClient, {
            mint: target.mint,
            symbol: String(updates.symbol ?? updates.token_symbol ?? rowSymbol(target) ?? ''),
            name: String(updates.name ?? updates.token_name ?? rowName(target) ?? ''),
            creatorWallet: String(updates.creator_wallet ?? target.token.creator_wallet ?? ''),
            twitterUrl: String(updates.twitter_url ?? target.token.twitter_url ?? ''),
            telegramUrl: String(updates.telegram_url ?? target.token.telegram_url ?? ''),
            websiteUrl: String(updates.website_url ?? target.token.website_url ?? ''),
            source: 'enrich-scraped-tokens',
          }).catch(e => console.warn('[mesh-feeder] enrich feed failed:', e));
        }

        results.push({
          token_mint: target.mint,
          table: target.table,
          success: Object.keys(updates).length > 0,
          updates,
          providers: providerNotes,
          reason: Object.keys(updates).length > 0 ? undefined : 'no_provider_data_returned',
        });
      } catch (error) {
        if ((error as any)?.name === 'DbWriteError') throw error;
        console.error(`Error enriching ${target.table} ${target.mint}:`, error);
        results.push({
          token_mint: target.mint,
          table: target.table,
          success: false,
          error: (error as Error).message,
        });
      }
      await delay(150);
    }

    if (enrichedCount > 0) {
      const { error: refreshError } = await supabaseClient.rpc('refresh_master_token_directory');
      if (refreshError) throw refreshError;
    }

    console.log(`Enrichment complete: ${enrichedCount}/${targets.length} token rows updated`);

    return new Response(
      JSON.stringify({
        message: `Enriched ${enrichedCount} of ${targets.length} token rows`,
        enriched: enrichedCount,
        total: targets.length,
        byTable,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in enrich-scraped-tokens:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));
