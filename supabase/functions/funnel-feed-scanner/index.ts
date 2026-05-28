import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from '../_shared/run-logger.ts';
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { trackFunnelStage } from '../_shared/funnel-tracker.ts';
import { isInfrastructureToken } from "../_shared/excluded-tokens.ts";
import { fetchPumpFunCoin } from '../_shared/pumpfun-fetch.ts';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { birdeyeResolveCreator } from '../_shared/birdeye-creator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana address regex - base58, 32-44 chars
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// Known launchpad suffixes that guarantee it's a token mint
const KNOWN_TOKEN_SUFFIXES = ['pump', 'moon'];

function hasKnownTokenSuffix(mint: string): boolean {
  return KNOWN_TOKEN_SUFFIXES.some(s => mint.endsWith(s));
}

// Validate if a Solana address is actually a token mint (not a wallet/pool/program)
// Uses DexScreener as a lightweight check — if it has pairs, it's a real token
async function validateTokenMint(mint: string): Promise<{ valid: boolean; symbol?: string; name?: string }> {
  // Known launchpad suffixes are always valid
  if (hasKnownTokenSuffix(mint)) {
    return { valid: true };
  }

  // For unknown-suffix addresses, check DexScreener for pairs
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.pairs && d.pairs.length > 0) {
        const pair = d.pairs[0];
        return {
          valid: true,
          symbol: pair.baseToken?.symbol || undefined,
          name: pair.baseToken?.name || undefined,
        };
      }
    }
  } catch { /* ignore */ }

  // No pairs found — very likely not a token mint
  console.log(`[funnel-feed-scanner] Skipping ${mint}: no DexScreener pairs, likely not a token mint`);
  return { valid: false };
}

// Quick metadata fetch: pump.fun first, then DexScreener fallback
async function fetchTokenMeta(mint: string): Promise<{ symbol?: string; name?: string }> {
  // Try pump.fun first (throttled)
  try {
    const d = await fetchPumpFunCoin(mint, 'funnel-feed-scanner');
    if (d?.symbol) return { symbol: d.symbol, name: d.name || undefined };
  } catch { /* fall through */ }

  // Fallback: DexScreener
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      const pair = d.pairs?.[0];
      if (pair?.baseToken?.symbol) {
        return { symbol: pair.baseToken.symbol, name: pair.baseToken.name || undefined };
      }
    }
  } catch { /* ignore */ }

  return {};
}

// Richer metadata fetch used at watchlist-insert time so the row has at least
// price/mcap/liquidity/creator_wallet on day 1 instead of all-null.
interface RichMeta {
  symbol?: string;
  name?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  creatorWallet?: string;
  bondingCurvePct?: number;
  imageUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
}
async function fetchRichMeta(mint: string, supabase?: any): Promise<RichMeta> {
  const out: RichMeta = {};
  // Pump.fun (throttled) — gives us creator + bonding curve when on-curve.
  try {
    const d = await fetchPumpFunCoin(mint, 'funnel-feed-scanner');
    if (d) {
      out.symbol = d.symbol || out.symbol;
      out.name = d.name || out.name;
      out.creatorWallet = d.creator || out.creatorWallet;
      out.imageUrl = d.image_uri || out.imageUrl;
      out.twitterUrl = d.twitter || out.twitterUrl;
      out.telegramUrl = d.telegram || out.telegramUrl;
      out.websiteUrl = d.website || out.websiteUrl;
      if (typeof d.usd_market_cap === 'number') out.marketCapUsd = d.usd_market_cap;
      // pump.fun curve fields are not all consistent — leave bondingCurvePct unset here.
    }
  } catch { /* ignore */ }

  // DexScreener — gives us price/mcap/liquidity once a pair exists.
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      const pair = d.pairs?.[0];
      if (pair) {
        out.symbol = out.symbol || pair.baseToken?.symbol || undefined;
        out.name = out.name || pair.baseToken?.name || undefined;
        if (pair.priceUsd) {
          const p = parseFloat(pair.priceUsd);
          if (!Number.isNaN(p) && p > 0) out.priceUsd = p;
        }
        if (typeof pair.marketCap === 'number') out.marketCapUsd = pair.marketCap;
        else if (typeof pair.fdv === 'number') out.marketCapUsd = out.marketCapUsd ?? pair.fdv;
        if (typeof pair.liquidity?.usd === 'number') out.liquidityUsd = pair.liquidity.usd;
      }
    }
  } catch { /* ignore */ }

  // Birdeye fast-path — pre-resolve creator on insertion so the backfill
  // queue stays small. 1 credit, ~150-400ms. Only if Pump.fun didn't give one.
  if (!out.creatorWallet) {
    try {
      const owner = await birdeyeResolveCreator(mint, 'funnel-feed-scanner', supabase);
      if (owner) out.creatorWallet = owner;
    } catch { /* ignore */ }
  }

  return out;
}

// Known non-token addresses to skip (system programs, common wallets)
const SKIP_ADDRESSES = new Set([
  '11111111111111111111111111111111',
  'So11111111111111111111111111111111111111112',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
]);

interface FunnelSource {
  id: string;
  source_id: string;
  source_name: string;
  source_type: string;
  last_message_id: number;
  scrape_interval_minutes: number;
  last_scraped_at: string | null;
}

Deno.serve(withRunLog('funnel-feed-scanner', async (req) => {
  if (!await isFunctionEnabled('funnel-feed-scanner')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'scan';

    // ── Manual actions from UI ──
    if (action === 'add_source') {
      const { source_id, source_name, source_type, scrape_interval_minutes, notes } = body;
      if (!source_id || !source_name) {
        return jsonRes({ error: 'source_id and source_name required' }, 400);
      }
      const { data, error } = await supabase
        .from('funnel_feed_sources')
        .upsert({
          source_id: source_id.toString(),
          source_name,
          source_type: source_type || 'telegram_channel',
          scrape_interval_minutes: scrape_interval_minutes || 5,
          notes: notes || null,
          is_active: true,
        }, { onConflict: 'source_id' })
        .select()
        .single();
      if (error) return jsonRes({ error: (error as Error).message }, 500);
      return jsonRes({ success: true, source: data });
    }

    if (action === 'toggle_source') {
      const { id, is_active } = body;
      const { error } = await supabase
        .from('funnel_feed_sources')
        .update({ is_active })
        .eq('id', id);
      if (error) return jsonRes({ error: (error as Error).message }, 500);
      return jsonRes({ success: true });
    }

    if (action === 'delete_source') {
      const { id } = body;
      const { error } = await supabase
        .from('funnel_feed_sources')
        .delete()
        .eq('id', id);
      if (error) return jsonRes({ error: (error as Error).message }, 500);
      return jsonRes({ success: true });
    }

    if (action === 'get_sources') {
      const { data, error } = await supabase
        .from('funnel_feed_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return jsonRes({ error: (error as Error).message }, 500);
      return jsonRes({ sources: data });
    }

    if (action === 'get_discoveries') {
      const limit = body.limit || 100;
      const { data, error } = await supabase
        .from('funnel_feed_discoveries')
        .select('*, funnel_feed_sources(source_name)')
        .order('discovered_at', { ascending: false })
        .limit(limit);
      if (error) return jsonRes({ error: (error as Error).message }, 500);
      return jsonRes({ discoveries: data });
    }

    // ── Backfill: fetch metadata for discoveries with null symbols ──
    if (action === 'backfill_metadata') {
      const { data: nullRows } = await supabase
        .from('funnel_feed_discoveries')
        .select('id, token_mint')
        .is('token_symbol', null)
        .limit(50);
      if (!nullRows?.length) return jsonRes({ message: 'Nothing to backfill', updated: 0 });
      let updated = 0;
      for (const row of nullRows) {
        const meta = await fetchTokenMeta(row.token_mint);
        if (meta.symbol) {
          await supabase.from('funnel_feed_discoveries')
            .update({ token_symbol: meta.symbol, token_name: meta.name || null })
            .eq('id', row.id);
          // Also update watchlist
          await supabase.from('pumpfun_watchlist')
            .update({ token_symbol: meta.symbol, token_name: meta.name || null })
            .eq('token_mint', row.token_mint)
            .is('token_symbol', null);
          updated++;
        }
      }
      return jsonRes({ message: `Backfilled ${updated}/${nullRows.length}`, updated });
    }

    // ── Backfill: push queued discoveries into the actual post queue ──
    if (action === 'backfill_xpost_queue') {
      const { data: queued } = await supabase
        .from('funnel_feed_discoveries')
        .select('token_mint, token_symbol, token_name, source_id, funnel_feed_sources(source_name)')
        .eq('xpost_status', 'queued');

      if (!queued?.length) return jsonRes({ message: 'No queued discoveries', inserted: 0 });

      const { data: existing } = await supabase
        .from('holders_intel_post_queue')
        .select('token_mint')
        .in('token_mint', queued.map(q => q.token_mint));
      const existingSet = new Set((existing || []).map(e => e.token_mint));

      let inserted = 0;
      for (const q of queued) {
        if (existingSet.has(q.token_mint)) continue;
        if (isInfrastructureToken(q.token_mint)) continue;
        const scheduledAt = new Date(Date.now() + Math.floor(Math.random() * 1_800_000)).toISOString();
        const { error } = await supabase.from('holders_intel_post_queue').insert({
          token_mint: q.token_mint,
          symbol: q.token_symbol || null,
          name: q.token_name || null,
          scheduled_at: scheduledAt,
          status: 'pending',
          trigger_source: 'funnel_feed',
          trigger_comment: null,
        });
        if (!error) inserted++;
      }
      return jsonRes({ message: `Inserted ${inserted}/${queued.length} into post queue`, inserted });
    }

    // ── SCAN: Scrape active sources via MTProto ──
    if (action === 'scan') {
      return await runScan(supabase, body.source_id);
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('[funnel-feed-scanner] Error:', err);
    return jsonRes({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
}));

async function runScan(supabase: any, specificSourceId?: string) {
  // Get active sources
  let query = supabase
    .from('funnel_feed_sources')
    .select('*')
    .eq('is_active', true);
  
  if (specificSourceId) {
    query = query.eq('source_id', specificSourceId);
  }
  
  const { data: sources, error: srcErr } = await query;
  if (srcErr || !sources?.length) {
    return jsonRes({ message: 'No active sources to scan', error: srcErr?.message });
  }

  const results: any[] = [];

  for (const source of sources) {
    try {
      // Step 1: Scrape messages via MTProto (same as telegram-channel-monitor)
      const messages = await scrapeViaMTProto(supabase, source);
      
      // Step 2: Extract tokens from scraped messages
      const result = await processMessages(supabase, source, messages);
      results.push({ source: source.source_name, ...result });
    } catch (err) {
      console.error(`[funnel-feed-scanner] Error processing ${source.source_name}:`, err);
      results.push({ source: source.source_name, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  return jsonRes({ scanned: results.length, results });
}

// Scrape channel/group messages via MTProto using telegram-mtproto-auth (same pattern as telegram-channel-monitor)
async function scrapeViaMTProto(supabase: any, source: FunnelSource): Promise<any[]> {
  // source_id can be a numeric chat ID or a channel username
  const isNumeric = /^-?\d+$/.test(source.source_id);
  
  const invokeBody: any = {
    action: 'fetch_recent_messages',
    limit: 200,
  };

  if (isNumeric) {
    invokeBody.chatId = parseInt(source.source_id, 10);
  } else {
    invokeBody.channelUsername = source.source_id;
  }

  console.log(`[funnel-feed-scanner] MTProto fetch for ${source.source_name} (${isNumeric ? 'chatId' : 'username'}: ${source.source_id})`);

  const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
    body: invokeBody,
  });

  if (error) {
    console.error(`[funnel-feed-scanner] MTProto invoke error for ${source.source_name}:`, (error as Error).message);
    throw new Error(`MTProto error: ${(error as Error).message}`);
  }

  if (!data?.success) {
    console.error(`[funnel-feed-scanner] MTProto failed for ${source.source_name}:`, data?.error);
    throw new Error(`MTProto failed: ${data?.error || 'Unknown'}`);
  }

  const messages = data.messages || [];
  console.log(`[funnel-feed-scanner] MTProto returned ${messages.length} messages from ${source.source_name}`);
  return messages;
}

// Process MTProto messages - extract tokens, dedup, insert discoveries
async function processMessages(supabase: any, source: FunnelSource, messages: any[]) {
  if (!messages.length) {
    await supabase
      .from('funnel_feed_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);
    return { tokens_found: 0, messages_processed: 0, message: 'No messages from MTProto' };
  }

  // Filter to only messages newer than last_message_id to avoid reprocessing
  const lastMsgId = source.last_message_id || 0;
  const newMessages = messages.filter((m: any) => (parseInt(m.messageId || m.id || '0', 10)) > lastMsgId);
  
  console.log(`[funnel-feed-scanner] ${newMessages.length} new messages (after msg ID ${lastMsgId}) for ${source.source_name}`);

  if (newMessages.length === 0) {
    await supabase
      .from('funnel_feed_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);
    return { tokens_found: 0, messages_processed: 0, new_tokens: 0, message: 'No new messages since last scan' };
  }

  // Extract Solana addresses from new messages
  const discoveredTokens: Map<string, { messageId: number; text: string }> = new Map();
  let maxMessageId = lastMsgId;

  for (const msg of newMessages) {
    const text = msg.text || '';
    const msgId = parseInt(msg.messageId || msg.id || '0', 10);
    maxMessageId = Math.max(maxMessageId, msgId);

    const addresses = text.match(SOLANA_ADDRESS_REGEX) || [];
    for (const addr of addresses) {
      if (SKIP_ADDRESSES.has(addr)) continue;
      if (addr.length < 32 || addr.length > 44) continue;
      if (!discoveredTokens.has(addr)) {
        discoveredTokens.set(addr, { messageId: msgId, text: text.slice(0, 200) });
      }
    }
  }

  console.log(`[funnel-feed-scanner] Found ${discoveredTokens.size} potential token addresses in ${source.source_name}`);

  let newTokens = 0;
  let skippedNonTokens = 0;

  for (const [mint, info] of discoveredTokens) {
    // Trust channel-sourced CAs. Only filter infra/skip addresses.
    if (isInfrastructureToken(mint)) {
      skippedNonTokens++;
      continue;
    }
    const validation: { symbol?: string | null; name?: string | null } = {};
    // Check if already discovered from this source
    const { data: existing } = await supabase
      .from('funnel_feed_discoveries')
      .select('id')
      .eq('token_mint', mint)
      .eq('source_id', source.id)
      .maybeSingle();

    if (existing) continue;

    // Check if already in pumpfun_watchlist
    const { data: watchlistEntry } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, token_name, status')
      .eq('token_mint', mint)
      .maybeSingle();

    // Resolve symbol/name: validation result first, then watchlist, then pump.fun API
    let tokenSymbol = validation.symbol || watchlistEntry?.token_symbol || null;
    let tokenName = validation.name || watchlistEntry?.token_name || null;
    // Always pull rich metadata for new tokens — symbol/name + price/mcap/liquidity/creator.
    // For tokens already in the watchlist, only refresh symbol/name if missing.
    const richMeta = !watchlistEntry ? await fetchRichMeta(mint, supabase) : ({} as RichMeta);
    if (!tokenSymbol) tokenSymbol = richMeta.symbol || null;
    if (!tokenName) tokenName = richMeta.name || null;
    if (!tokenSymbol) {
      const meta = await fetchTokenMeta(mint);
      tokenSymbol = meta.symbol || null;
      tokenName = meta.name || null;
    }

    const watchlistStatus = watchlistEntry ? 'already_exists' : 'pending';

    // Check if already posted to X
    const { data: xpostEntry } = await supabase
      .from('holders_intel_posts')
      .select('id')
      .eq('token_address', mint)
      .maybeSingle();

    const xpostStatus = xpostEntry ? 'already_seen' : 'pending';

    const { error: insertErr } = await supabase
      .from('funnel_feed_discoveries')
      .insert({
        token_mint: mint,
        token_symbol: tokenSymbol,
        token_name: tokenName,
        source_id: source.id,
        source_message_id: info.messageId,
        watchlist_status: watchlistStatus,
        xpost_status: xpostStatus,
        mesh_status: 'pending',
      });

    if (!insertErr) {
      newTokens++;

      // Fire the dev-wallet resolution waterfall (cache → creator → Solscan
      // fund_by → dev_wallet). Fire-and-forget so the scan stays fast; the
      // 2-min insiders-lifecycle-builder is the safety net for stragglers.
      try {
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/insiders-row-ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: JSON.stringify({
            mint,
            symbol: tokenSymbol,
            channel_name: source.source_name,
            message_id: info.messageId,
          }),
        }).catch(() => { /* fire-and-forget */ });
      } catch { /* ignore */ }

      // Feed into mesh pipeline
      try {
        await meshFeed.token(supabase, {
          mint,
          symbol: tokenSymbol || undefined,
          name: tokenName || undefined,
          source: `funnel_feed:${source.source_name}`,
        });
      } catch (meshErr) {
        console.warn(`[funnel-feed-scanner] Mesh feed error for ${mint}:`, meshErr);
      }

      // Insert into watchlist if not already there
      if (watchlistStatus === 'pending') {
        const watchlistRow: Record<string, unknown> = {
          token_mint: mint,
          token_symbol: tokenSymbol,
          token_name: tokenName,
          status: 'pending_triage',
          source: `funnel_feed:${source.source_name}`,
          created_at: new Date().toISOString(),
          last_processor: 'funnel-feed-scanner',
        };
        if (typeof richMeta.priceUsd === 'number' && richMeta.priceUsd > 0) {
          watchlistRow.price_usd = richMeta.priceUsd;
          watchlistRow.price_current = richMeta.priceUsd;
          watchlistRow.price_at_discovery_usd = richMeta.priceUsd;
        }
        if (typeof richMeta.marketCapUsd === 'number' && richMeta.marketCapUsd > 0) {
          watchlistRow.market_cap_usd = richMeta.marketCapUsd;
          watchlistRow.ath_market_cap_usd = richMeta.marketCapUsd;
          watchlistRow.ath_market_cap_at = new Date().toISOString();
        }
        if (typeof richMeta.liquidityUsd === 'number' && richMeta.liquidityUsd > 0) {
          watchlistRow.liquidity_usd = richMeta.liquidityUsd;
        }
        if (richMeta.creatorWallet) watchlistRow.creator_wallet = richMeta.creatorWallet;
        if (richMeta.imageUrl) watchlistRow.image_url = richMeta.imageUrl;
        if (richMeta.twitterUrl) watchlistRow.twitter_url = richMeta.twitterUrl;
        if (richMeta.telegramUrl) watchlistRow.telegram_url = richMeta.telegramUrl;
        if (richMeta.websiteUrl) watchlistRow.website_url = richMeta.websiteUrl;

        const { error: wlErr } = await supabase
          .from('pumpfun_watchlist')
          .insert(watchlistRow)
          .select()
          .single();

        if (wlErr && !wlErr.message.includes('duplicate')) {
          console.warn(`[funnel-feed-scanner] Watchlist insert error for ${mint}:`, wlErr.message);
        } else {
          await supabase
            .from('funnel_feed_discoveries')
            .update({ watchlist_status: 'inserted', watchlist_processed_at: new Date().toISOString() })
            .eq('token_mint', mint)
            .eq('source_id', source.id);
        }
      }

      // Queue for X posting — insert into the actual post queue the poster reads from
      if (xpostStatus === 'pending') {
        const scheduledAt = new Date(Date.now() + Math.floor(Math.random() * 300_000)).toISOString(); // random 0-5min delay
        const { error: queueErr } = await supabase
          .from('holders_intel_post_queue')
          .insert({
            token_mint: mint,
            symbol: tokenSymbol || null,
            name: tokenName || null,
            scheduled_at: scheduledAt,
            status: 'pending',
            trigger_source: 'funnel_feed',
            trigger_comment: null,
          });

        const newXpostStatus = queueErr ? 'failed' : 'queued';
        if (queueErr) {
          console.warn(`[funnel-feed-scanner] Post queue insert error for ${mint}:`, queueErr.message);
        }

        await supabase
          .from('funnel_feed_discoveries')
          .update({ xpost_status: newXpostStatus, xpost_processed_at: new Date().toISOString() })
          .eq('token_mint', mint)
          .eq('source_id', source.id);
      }

      // Update mesh status
      await supabase
        .from('funnel_feed_discoveries')
        .update({ mesh_status: 'completed', mesh_processed_at: new Date().toISOString() })
        .eq('token_mint', mint)
        .eq('source_id', source.id);
    }
  }

  // Update source tracking
  await supabase
    .from('funnel_feed_sources')
    .update({
      last_scraped_at: new Date().toISOString(),
      last_message_id: maxMessageId,
      tokens_discovered: ((source as any).tokens_discovered || 0) + newTokens,
    })
    .eq('id', source.id);

  // Track funnel stage
  if (newTokens > 0) {
    await trackFunnelStage(supabase, 'discovered', newTokens);
  }

  return { tokens_found: discoveredTokens.size, new_tokens: newTokens, skipped_non_tokens: skippedNonTokens, messages_processed: newMessages.length, max_message_id: maxMessageId };
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
