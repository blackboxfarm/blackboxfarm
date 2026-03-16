import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { meshFeed } from "../_shared/mesh-feeder.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana address regex - base58, 32-44 chars
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

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

Deno.serve(async (req) => {
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
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true, source: data });
    }

    if (action === 'toggle_source') {
      const { id, is_active } = body;
      const { error } = await supabase
        .from('funnel_feed_sources')
        .update({ is_active })
        .eq('id', id);
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true });
    }

    if (action === 'delete_source') {
      const { id } = body;
      const { error } = await supabase
        .from('funnel_feed_sources')
        .delete()
        .eq('id', id);
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true });
    }

    if (action === 'get_sources') {
      const { data, error } = await supabase
        .from('funnel_feed_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ sources: data });
    }

    if (action === 'get_discoveries') {
      const limit = body.limit || 100;
      const { data, error } = await supabase
        .from('funnel_feed_discoveries')
        .select('*, funnel_feed_sources(source_name)')
        .order('discovered_at', { ascending: false })
        .limit(limit);
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ discoveries: data });
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
});

async function runScan(supabase: any, specificSourceId?: string) {
  // Get active sources due for scraping
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

  // Filter to sources that are due for scraping
  const now = Date.now();
  const dueSources: FunnelSource[] = sources.filter((s: FunnelSource) => {
    if (specificSourceId) return true; // Force scan if manually triggered
    if (!s.last_scraped_at) return true;
    const elapsed = now - new Date(s.last_scraped_at).getTime();
    return elapsed >= s.scrape_interval_minutes * 60 * 1000;
  });

  if (dueSources.length === 0) {
    return jsonRes({ message: 'No sources due for scraping' });
  }

  console.log(`[funnel-feed-scanner] Scanning ${dueSources.length} sources...`);

  const results: any[] = [];

  for (const source of dueSources) {
    try {
      const result = await scrapeSource(supabase, source);
      results.push({ source: source.source_name, ...result });
    } catch (err) {
      console.error(`[funnel-feed-scanner] Error scraping ${source.source_name}:`, err);
      results.push({ source: source.source_name, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  return jsonRes({ scanned: results.length, results });
}

async function scrapeSource(supabase: any, source: FunnelSource) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Use telegram-channel-monitor's MTProto infrastructure to read messages
  // We call the existing scrape endpoint to get recent messages
  const telegramBotToken = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
  
  let messages: any[] = [];
  
  // Try Bot API getUpdates for channels where bot is admin, or use MTProto
  // For channels, we use the Telegram Bot API's getChat + forwardMessage approach
  // But simplest: call the telegram-channel-monitor's internal scrape
  
  // Use Telegram Bot API to get channel messages via getUpdates won't work for channels
  // Instead, use the MTProto session to read channel history
  
  // Use 30-min lookback window to catch missed messages, dedup at insert level
  const lookbackMinutes = 30;
  const lookbackId = Math.max(0, (source.last_message_id || 0) - 200); // ~200 msgs overlap buffer

  try {
    // Call internal edge function to scrape channel messages
    const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-channel-monitor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'scrape_channel_messages',
        channel_id: source.source_id,
        min_id: lookbackId,
        limit: 100,
        offset_date: Math.floor((Date.now() - lookbackMinutes * 60 * 1000) / 1000),
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      messages = data.messages || [];
    } else {
      // Fallback: try Bot API for groups where bot is a member
      console.log(`[funnel-feed-scanner] MTProto scrape failed for ${source.source_name}, trying Bot API...`);
      messages = await fetchViaBotApi(telegramBotToken, source.source_id, source.last_message_id);
    }
  } catch (err) {
    console.warn(`[funnel-feed-scanner] Scrape error for ${source.source_name}:`, err);
    // Try Bot API fallback
    if (telegramBotToken) {
      messages = await fetchViaBotApi(telegramBotToken, source.source_id, source.last_message_id);
    }
  }

  if (!messages.length) {
    // Update last_scraped_at even if no messages
    await supabase
      .from('funnel_feed_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);
    return { tokens_found: 0, message: 'No new messages' };
  }

  // Extract Solana addresses from messages
  const discoveredTokens: Map<string, { messageId: number; text: string }> = new Map();
  let maxMessageId = source.last_message_id || 0;

  for (const msg of messages) {
    const text = msg.text || msg.message || '';
    const msgId = msg.message_id || msg.id || 0;
    maxMessageId = Math.max(maxMessageId, msgId);

    const addresses = text.match(SOLANA_ADDRESS_REGEX) || [];
    for (const addr of addresses) {
      if (SKIP_ADDRESSES.has(addr)) continue;
      if (addr.length < 32 || addr.length > 44) continue;
      // Basic heuristic: token mints often end in 'pump' or are exactly 44 chars
      if (!discoveredTokens.has(addr)) {
        discoveredTokens.set(addr, { messageId: msgId, text: text.slice(0, 200) });
      }
    }
  }

  console.log(`[funnel-feed-scanner] Found ${discoveredTokens.size} potential token addresses in ${source.source_name}`);

  let newTokens = 0;

  for (const [mint, info] of discoveredTokens) {
    // Upsert into discoveries table
    const { data: existing } = await supabase
      .from('funnel_feed_discoveries')
      .select('id')
      .eq('token_mint', mint)
      .eq('source_id', source.id)
      .maybeSingle();

    if (existing) continue; // Already discovered from this source

    // Check if already in pumpfun_watchlist
    const { data: watchlistEntry } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, token_name, status')
      .eq('token_mint', mint)
      .maybeSingle();

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
        token_symbol: watchlistEntry?.token_symbol || null,
        token_name: watchlistEntry?.token_name || null,
        source_id: source.id,
        source_message_id: info.messageId,
        watchlist_status: watchlistStatus,
        xpost_status: xpostStatus,
        mesh_status: 'pending',
      });

    if (!insertErr) {
      newTokens++;

      // Feed into mesh pipeline (fire-and-forget)
      try {
        await meshFeed(supabase, {
          entity_type: 'token',
          entity_id: mint,
          source: `funnel_feed:${source.source_name}`,
        });
      } catch (meshErr) {
        console.warn(`[funnel-feed-scanner] Mesh feed error for ${mint}:`, meshErr);
      }

      // If not in watchlist, insert as pending_triage for pipeline processing
      if (watchlistStatus === 'pending') {
        const { error: wlErr } = await supabase
          .from('pumpfun_watchlist')
          .insert({
            token_mint: mint,
            token_symbol: watchlistEntry?.token_symbol || null,
            token_name: watchlistEntry?.token_name || null,
            status: 'pending_triage',
            source: `funnel_feed:${source.source_name}`,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (wlErr && !wlErr.message.includes('duplicate')) {
          console.warn(`[funnel-feed-scanner] Watchlist insert error for ${mint}:`, wlErr.message);
        } else {
          // Update discovery status
          await supabase
            .from('funnel_feed_discoveries')
            .update({ watchlist_status: 'inserted', watchlist_processed_at: new Date().toISOString() })
            .eq('token_mint', mint)
            .eq('source_id', source.id);
        }
      }

      // If not yet posted to X, queue for holders-intel-poster
      if (xpostStatus === 'pending') {
        // The holders-intel-scheduler will pick it up from the watchlist
        // We just mark it as queued
        await supabase
          .from('funnel_feed_discoveries')
          .update({ xpost_status: 'queued', xpost_processed_at: new Date().toISOString() })
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
      tokens_discovered: source.tokens_discovered + newTokens,
    })
    .eq('id', source.id);

  return { tokens_found: discoveredTokens.size, new_tokens: newTokens, max_message_id: maxMessageId };
}

async function fetchViaBotApi(botToken: string | undefined, chatId: string, _afterId: number): Promise<any[]> {
  if (!botToken) return [];
  
  try {
    // Bot API doesn't support getHistory, but for groups where bot is admin we can try
    // This is limited - mainly works for supergroups
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_updates: ['channel_post', 'message'],
        limit: 100,
      }),
    });
    
    if (!resp.ok) return [];
    const data = await resp.json();
    
    // Filter to messages from the target chat
    return (data.result || [])
      .filter((u: any) => {
        const msg = u.message || u.channel_post;
        return msg && msg.chat.id.toString() === chatId.toString();
      })
      .map((u: any) => u.message || u.channel_post);
  } catch {
    return [];
  }
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
