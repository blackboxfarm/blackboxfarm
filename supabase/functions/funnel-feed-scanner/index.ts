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
  const botToken = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
  if (!botToken) {
    return jsonRes({ error: 'TELEGRAM_HOLDERSINTEL_BOT_TOKEN not configured' }, 500);
  }

  // Step 1: Poll getUpdates to capture new channel_post messages
  const capturedCount = await pollBotUpdates(supabase, botToken);
  console.log(`[funnel-feed-scanner] Captured ${capturedCount} new messages from getUpdates`);

  // Step 2: Get active sources
  let query = supabase
    .from('funnel_feed_sources')
    .select('*')
    .eq('is_active', true);
  
  if (specificSourceId) {
    query = query.eq('source_id', specificSourceId);
  }
  
  const { data: sources, error: srcErr } = await query;
  if (srcErr || !sources?.length) {
    return jsonRes({ message: 'No active sources to scan', captured: capturedCount, error: srcErr?.message });
  }

  // Step 3: Process unprocessed messages for each source
  const results: any[] = [];

  for (const source of sources) {
    try {
      const result = await processSourceMessages(supabase, source);
      results.push({ source: source.source_name, ...result });
    } catch (err) {
      console.error(`[funnel-feed-scanner] Error processing ${source.source_name}:`, err);
      results.push({ source: source.source_name, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  return jsonRes({ captured: capturedCount, scanned: results.length, results });
}

// Poll Telegram Bot API getUpdates and store raw messages
async function pollBotUpdates(supabase: any, botToken: string): Promise<number> {
  // Get current offset
  const { data: state } = await supabase
    .from('funnel_feed_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  let offset = state?.update_offset || 0;
  let totalCaptured = 0;

  // Poll up to 3 times (short timeout each) to drain pending updates
  for (let i = 0; i < 3; i++) {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset,
        timeout: 2, // 2-second long poll
        limit: 100,
        allowed_updates: ['channel_post', 'message'],
      }),
    });

    if (!resp.ok) {
      console.error(`[funnel-feed-scanner] getUpdates failed: ${resp.status}`);
      break;
    }

    const data = await resp.json();
    const updates = data.result || [];
    if (updates.length === 0) break;

    // Store raw messages
    const rows = updates
      .filter((u: any) => u.channel_post || u.message)
      .map((u: any) => {
        const msg = u.channel_post || u.message;
        return {
          update_id: u.update_id,
          chat_id: msg.chat.id.toString(),
          message_id: msg.message_id,
          message_text: msg.text || msg.caption || '',
          message_date: new Date(msg.date * 1000).toISOString(),
          processed: false,
        };
      });

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from('funnel_feed_raw_messages')
        .upsert(rows, { onConflict: 'update_id', ignoreDuplicates: true });

      if (insertErr) {
        console.error(`[funnel-feed-scanner] Raw message insert error:`, insertErr.message);
      } else {
        totalCaptured += rows.length;
      }
    }

    // Advance offset
    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase
      .from('funnel_feed_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);
    offset = newOffset;

    // If we got fewer than 100, we've drained the queue
    if (updates.length < 100) break;
  }

  return totalCaptured;
}

// Process unprocessed raw messages for a given source
async function processSourceMessages(supabase: any, source: FunnelSource) {
  // Get unprocessed messages from this source's chat
  const { data: rawMsgs, error: rawErr } = await supabase
    .from('funnel_feed_raw_messages')
    .select('*')
    .eq('chat_id', source.source_id)
    .eq('processed', false)
    .order('message_id', { ascending: true })
    .limit(200);

  if (rawErr || !rawMsgs?.length) {
    // Update last_scraped_at even if no messages
    await supabase
      .from('funnel_feed_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);
    return { tokens_found: 0, messages_processed: 0, message: rawMsgs?.length === 0 ? 'No new messages' : rawErr?.message };
  }

  console.log(`[funnel-feed-scanner] Processing ${rawMsgs.length} messages for ${source.source_name}`);

  // Extract Solana addresses from messages
  const discoveredTokens: Map<string, { messageId: number; text: string }> = new Map();
  let maxMessageId = source.last_message_id || 0;
  const processedIds: number[] = [];

  for (const msg of rawMsgs) {
    const text = msg.message_text || '';
    const msgId = msg.message_id || 0;
    maxMessageId = Math.max(maxMessageId, msgId);
    processedIds.push(msg.id);

    const addresses = text.match(SOLANA_ADDRESS_REGEX) || [];
    for (const addr of addresses) {
      if (SKIP_ADDRESSES.has(addr)) continue;
      if (addr.length < 32 || addr.length > 44) continue;
      if (!discoveredTokens.has(addr)) {
        discoveredTokens.set(addr, { messageId: msgId, text: text.slice(0, 200) });
      }
    }
  }

  // Mark messages as processed
  if (processedIds.length > 0) {
    await supabase
      .from('funnel_feed_raw_messages')
      .update({ processed: true })
      .in('id', processedIds);
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

      // Feed into mesh pipeline
      try {
        await meshFeed(supabase, {
          entity_type: 'token',
          entity_id: mint,
          source: `funnel_feed:${source.source_name}`,
        });
      } catch (meshErr) {
        console.warn(`[funnel-feed-scanner] Mesh feed error for ${mint}:`, meshErr);
      }

      // Insert into watchlist if not already there
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
          await supabase
            .from('funnel_feed_discoveries')
            .update({ watchlist_status: 'inserted', watchlist_processed_at: new Date().toISOString() })
            .eq('token_mint', mint)
            .eq('source_id', source.id);
        }
      }

      // Queue for X posting
      if (xpostStatus === 'pending') {
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
      tokens_discovered: (source.tokens_discovered || 0) + newTokens,
    })
    .eq('id', source.id);

  return { tokens_found: discoveredTokens.size, new_tokens: newTokens, messages_processed: rawMsgs.length, max_message_id: maxMessageId };
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
