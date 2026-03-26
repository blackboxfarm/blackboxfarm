import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
import { PUMPFUN_API_BASE, PUMPFUN_HEADERS } from '../_shared/pumpfun-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Community URL extraction helpers ───

function extractCommunityId(url: string): string | null {
  const match = url.match(/communities\/(\d+)/);
  return match ? match[1] : null;
}

function isTwitterUrl(url: string): boolean {
  return url.includes('twitter.com') || url.includes('x.com');
}

interface CommunityResult {
  communityId: string;
  communityUrl: string;
  source: string;
}

/** Extract community from any array of social/website objects or URL strings */
function extractCommunityFromLinks(links: any[], source: string): CommunityResult | null {
  for (const item of links) {
    const url = typeof item === 'string' ? item : (item?.url || item?.uri || '');
    if (url && isTwitterUrl(url)) {
      const cid = extractCommunityId(url);
      if (cid) return { communityId: cid, communityUrl: url, source };
    }
  }
  return null;
}

// ─── WATERFALL SOURCE PROVIDERS ───

/** Source 1: DexScreener batch API (30 tokens per call) */
async function fetchDexScreenerBatch(mints: string[]): Promise<Map<string, any>> {
  const pairsByMint = new Map<string, any>();
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; BlackBox/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      console.warn('[backfill] DexScreener rate limited');
      return pairsByMint;
    }
    if (!res.ok) return pairsByMint;
    const data = await res.json();
    if (data?.pairs) {
      for (const pair of data.pairs) {
        const mint = pair.baseToken?.address;
        if (mint && !pairsByMint.has(mint)) pairsByMint.set(mint, pair);
      }
    }
  } catch (e) {
    console.error('[backfill] DexScreener batch error:', e);
  }
  return pairsByMint;
}

/** Extract community + metadata from a DexScreener pair object */
function extractFromDexPair(pair: any): CommunityResult | null {
  if (!pair?.info) return null;
  // Check socials first
  const fromSocials = extractCommunityFromLinks(pair.info.socials || [], 'dexscreener');
  if (fromSocials) return fromSocials;
  // Check websites
  return extractCommunityFromLinks(pair.info.websites || [], 'dexscreener');
}

/** Source 2: Pump.fun API — returns socials for pump tokens */
async function fetchPumpFunSocials(mint: string): Promise<CommunityResult | null> {
  try {
    const res = await fetch(`${PUMPFUN_API_BASE}/coins/${mint}`, {
      headers: PUMPFUN_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // pump.fun returns twitter, telegram, website fields
    if (data.twitter) {
      const cid = extractCommunityId(data.twitter);
      if (cid) return { communityId: cid, communityUrl: data.twitter, source: 'pumpfun' };
    }
    // Also check website field
    if (data.website && isTwitterUrl(data.website)) {
      const cid = extractCommunityId(data.website);
      if (cid) return { communityId: cid, communityUrl: data.website, source: 'pumpfun' };
    }
  } catch (_) { /* silent */ }
  return null;
}

/** Source 3: Solscan free public API — token metadata includes socials */
async function fetchSolscanSocials(mint: string): Promise<CommunityResult | null> {
  try {
    // Solscan public v2 API (free, no key needed)
    const res = await fetch(`https://api-v2.solscan.io/v2/token/meta?address=${mint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; BlackBox/1.0)',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.data;
    if (!meta) return null;

    // Solscan returns metadata.twitter, metadata.website
    const urlsToCheck = [
      meta.twitter,
      meta.website,
      ...(meta.extensions?.twitter ? [meta.extensions.twitter] : []),
      ...(meta.extensions?.website ? [meta.extensions.website] : []),
    ].filter(Boolean);

    for (const url of urlsToCheck) {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      if (isTwitterUrl(fullUrl)) {
        const cid = extractCommunityId(fullUrl);
        if (cid) return { communityId: cid, communityUrl: fullUrl, source: 'solscan' };
      }
    }
  } catch (_) { /* silent */ }
  return null;
}

/** Source 4: Bonk.fun API */
async function fetchBonkFunSocials(mint: string): Promise<CommunityResult | null> {
  try {
    const res = await fetch(`https://api.bonk.fun/token/${mint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const urls = [data.twitter, data.website].filter(Boolean);
    return extractCommunityFromLinks(urls.map(u => ({ url: u })), 'bonkfun');
  } catch (_) { /* silent */ }
  return null;
}

/** Source 5: Bags.fm API */
async function fetchBagsFmSocials(mint: string): Promise<CommunityResult | null> {
  try {
    const res = await fetch(`https://api.bags.fm/api/v1/token/${mint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const urls = [data.twitter, data.website, data.socials?.twitter].filter(Boolean);
    return extractCommunityFromLinks(urls.map(u => ({ url: u })), 'bagsfm');
  } catch (_) { /* silent */ }
  return null;
}

/**
 * WATERFALL: Try each source in order until we find a community.
 * DexScreener is pre-fetched in batch, so we pass the pair directly.
 * Other sources are fetched individually only when DexScreener fails.
 */
async function waterfallCommunityLookup(
  mint: string,
  dexPair: any | null,
  launchpad: string | null,
): Promise<CommunityResult | null> {
  // 1. DexScreener (already fetched in batch)
  if (dexPair) {
    const result = extractFromDexPair(dexPair);
    if (result) return result;
  }

  // 2. Pump.fun (only for pump tokens or unknown — it's the biggest launchpad)
  if (!launchpad || launchpad === 'pump.fun' || mint.endsWith('pump')) {
    const result = await fetchPumpFunSocials(mint);
    if (result) return result;
    await delay(200);
  }

  // 3. Solscan free API (works for all tokens)
  const solscanResult = await fetchSolscanSocials(mint);
  if (solscanResult) return solscanResult;
  await delay(200);

  // 4. Bonk.fun (only if launchpad matches)
  if (launchpad === 'bonk.fun') {
    const result = await fetchBonkFunSocials(mint);
    if (result) return result;
    await delay(200);
  }

  // 5. Bags.fm (only if launchpad matches)
  if (launchpad === 'bags.fm') {
    const result = await fetchBagsFmSocials(mint);
    if (result) return result;
  }

  return null;
}

// ─── MAIN FUNCTION ───

Deno.serve(withRunLog('backfill-x-communities', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 300, 300);

    // Get unchecked tokens from BOTH source tables
    const [{ data: uncheckedScraped }, { data: uncheckedHI }] = await Promise.all([
      supabase.from('scraped_tokens').select('token_mint, symbol, launchpad').is('community_checked_at', null).limit(batchSize),
      supabase.from('holders_intel_seen_tokens').select('token_mint, symbol').is('community_checked_at', null).limit(batchSize),
    ]);

    // Deduplicate by token_mint, keep launchpad info
    const tokenMap = new Map<string, { symbol: string; launchpad: string | null }>();
    for (const t of (uncheckedScraped || [])) {
      tokenMap.set(t.token_mint, { symbol: t.symbol || '', launchpad: t.launchpad || null });
    }
    for (const t of (uncheckedHI || [])) {
      if (!tokenMap.has(t.token_mint)) {
        tokenMap.set(t.token_mint, { symbol: t.symbol || '', launchpad: null });
      }
    }

    const allMints = Array.from(tokenMap.keys()).slice(0, batchSize);

    if (allMints.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All tokens have been checked — backfill complete',
        processed: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[backfill-x-communities] Processing ${allMints.length} unchecked tokens (waterfall: DexScreener → Pump.fun → Solscan → Bonk → Bags)`);

    let communitiesFound = 0;
    let communitiesCreated = 0;
    let communitiesUpdated = 0;
    let noSocials = 0;
    let bondedUpdated = 0;
    let meshLinksCreated = 0;
    const sourceHits: Record<string, number> = {};

    // Process in DexScreener batch chunks (30 per API call)
    const CHUNK_SIZE = 30;
    for (let i = 0; i < allMints.length; i += CHUNK_SIZE) {
      const chunk = allMints.slice(i, i + CHUNK_SIZE);

      if (i > 0) await delay(500);

      // Batch fetch DexScreener for the chunk
      const dexPairs = await fetchDexScreenerBatch(chunk);

      // Update bonded_at + banner for any with DexScreener data
      for (const mint of chunk) {
        const pair = dexPairs.get(mint);
        if (pair) {
          const isBonded = pair.dexId && ['raydium', 'orca', 'meteora'].includes(pair.dexId.toLowerCase());
          if (isBonded) {
            const bondedTime = pair.pairCreatedAt
              ? new Date(pair.pairCreatedAt).toISOString()
              : new Date().toISOString();
            const { error: bondErr } = await supabase
              .from('holders_intel_seen_tokens')
              .update({ bonded_at: bondedTime })
              .eq('token_mint', mint)
              .is('bonded_at', null);
            if (!bondErr) bondedUpdated++;
          }
          if (pair.info?.header) {
            await supabase
              .from('holders_intel_seen_tokens')
              .update({ banner_url: pair.info.header })
              .eq('token_mint', mint)
              .is('banner_url', null);
          }
        }
      }

      // Now waterfall each token to find community
      for (const mint of chunk) {
        const pair = dexPairs.get(mint) || null;
        const info = tokenMap.get(mint)!;

        const community = await waterfallCommunityLookup(mint, pair, info.launchpad);

        if (!community) {
          noSocials++;
          continue;
        }

        communitiesFound++;
        sourceHits[community.source] = (sourceHits[community.source] || 0) + 1;

        // Upsert into x_communities
        const { data: existing } = await supabase
          .from('x_communities')
          .select('id, linked_token_mints')
          .eq('community_id', community.communityId)
          .single();

        if (existing) {
          const mints = (existing.linked_token_mints as string[]) || [];
          if (!mints.includes(mint)) {
            await supabase
              .from('x_communities')
              .update({
                linked_token_mints: [...mints, mint],
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            communitiesUpdated++;
          }
        } else {
          await supabase
            .from('x_communities')
            .insert({
              community_id: community.communityId,
              community_url: community.communityUrl,
              name: info.symbol ? `$${info.symbol} Community` : null,
              linked_token_mints: [mint],
              scrape_status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          communitiesCreated++;
        }

        // Mesh link
        const { data: meshExists } = await supabase
          .from('reputation_mesh')
          .select('id')
          .eq('source_type', 'x_community')
          .eq('source_id', community.communityId)
          .eq('linked_type', 'token')
          .eq('linked_id', mint)
          .maybeSingle();

        if (!meshExists) {
          await supabase
            .from('reputation_mesh')
            .insert({
              source_type: 'x_community',
              source_id: community.communityId,
              linked_type: 'token',
              linked_id: mint,
              relationship: 'community_for',
              confidence: 90,
              discovered_via: `backfill-${community.source}`,
              discovered_at: new Date().toISOString(),
            });
          meshLinksCreated++;
        }
      }

      // Mark entire chunk as checked
      await markChecked(supabase, chunk);
    }

    const summary = {
      success: true,
      processed: allMints.length,
      communitiesFound,
      communitiesCreated,
      communitiesUpdated,
      meshLinksCreated,
      noSocials,
      bondedUpdated,
      sourceHits,
    };

    console.log(`[backfill-x-communities] Done:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[backfill-x-communities] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

async function markChecked(supabase: any, mints: string[]) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('scraped_tokens').update({ community_checked_at: now }).in('token_mint', mints),
    supabase.from('holders_intel_seen_tokens').update({ community_checked_at: now }).in('token_mint', mints),
  ]);
}
