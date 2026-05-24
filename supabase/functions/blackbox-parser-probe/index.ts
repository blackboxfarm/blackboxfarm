// BlackBox Parser Probe — captures real raw bot replies for parser building.
//
// Modes:
//   action='probe'  → manually pick latest insider CA, post into BlackBox
//                     group via HoldersIntel, wait 30s, harvest all replies,
//                     dump verbatim into blackbox_parser_samples.
//   action='list'   → summary by bot (count, last_seen, last_edit).
//   action='samples'→ raw samples for one bot.
//   action='ingest' → internal call from blackbox-tick (passive capture).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseReply } from "../_shared/blackbox-parsers/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HARVEST_WINDOW_MS = 30_000;

async function sendViaHoldersIntel(chatId: number, text: string): Promise<number | null> {
  const token = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN");
  if (!token) { console.error("[parser-probe] no HI token"); return null; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) { console.error("[parser-probe] sendMessage failed", j); return null; }
  return j.result?.message_id ?? null;
}

/** Persist a single raw bot message as a sample row. */
async function ingestMessages(
  supabase: ReturnType<typeof createClient>,
  args: {
    token_mint: string;
    posted_at: string;
    messages: any[];
    source: 'manual_probe' | 'passive';
    probe_run_id?: string | null;
  },
): Promise<number> {
  const { token_mint, posted_at, messages, source, probe_run_id } = args;
  const sinceMs = new Date(posted_at).getTime();
  const nowMs = Date.now();
  const toIso = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    let ms: number;
    if (typeof v === 'number') {
      // Normalize: seconds → ms; microseconds → ms
      ms = v < 1e12 ? v * 1000 : v > 1e14 ? Math.floor(v / 1000) : v;
    } else {
      ms = new Date(v).getTime();
    }
    if (!isFinite(ms)) return null;
    // Clamp absurd timestamps (year > 9999) — Postgres timestamptz rejects them
    if (ms > nowMs + 365 * 86400 * 1000 || ms < 0) return null;
    return new Date(ms).toISOString();
  };
  let saved = 0;
  for (const m of messages) {
    const receivedIso = toIso(m.date);
    if (!receivedIso) continue;
    const d = new Date(receivedIso).getTime();
    if (d < sinceMs - 60_000) continue;
    const text = m.text || m.message || '';
    if (!text || !text.includes(token_mint)) continue;
    const username: string | null = m.callerUsername || m.fromUsername || null;
    const userId: number | null = m.callerUserId || m.fromId || null;
    const display: string | null = m.callerName || m.fromName || null;
    const { parser, fields } = parseReply(username, text);
    const row = {
      probe_run_id: probe_run_id ?? null,
      token_mint,
      posted_at,
      source,
      bot_username: username,
      bot_user_id: userId,
      bot_display_name: display,
      message_id: Number(m.messageId || m.id || 0),
      raw_text: text,
      raw_entities_jsonb: m.entities || null,
      inline_buttons_jsonb: m.replyMarkup || m.reply_markup || null,
      has_photo: !!m.hasPhoto,
      caption: m.caption || null,
      received_at: receivedIso,
      edited_at: toIso(m.editDate),
      parser_used: parser,
      parser_attempt_jsonb: fields,
    };
    const { error } = await supabase
      .from('blackbox_parser_samples')
      .upsert(row, { onConflict: 'token_mint,message_id,bot_username' });
    if (!error) saved++;
    else console.error('[parser-probe] upsert error', error.message);
  }
  return saved;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* GET ok */ }
  const action = (body?.action || new URL(req.url).searchParams.get('action') || 'list') as string;

  try {
    // ---- LIST: per-bot summary ----
    if (action === 'list') {
      const { data, error } = await supabase
        .from('blackbox_parser_samples')
        .select('bot_username, bot_display_name, received_at, edited_at, source')
        .order('received_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const byBot = new Map<string, any>();
      for (const r of (data || [])) {
        const k = r.bot_username || '(unknown)';
        const cur = byBot.get(k) || {
          bot_username: k, bot_display_name: r.bot_display_name,
          count: 0, last_seen: null as string | null, last_edit: null as string | null,
          manual: 0, passive: 0,
        };
        cur.count++;
        if (!cur.last_seen || r.received_at > cur.last_seen) cur.last_seen = r.received_at;
        if (r.edited_at && (!cur.last_edit || r.edited_at > cur.last_edit)) cur.last_edit = r.edited_at;
        if (r.source === 'manual_probe') cur.manual++; else cur.passive++;
        byBot.set(k, cur);
      }
      return new Response(JSON.stringify({ ok: true, bots: [...byBot.values()] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- SAMPLES: raw rows for one bot ----
    if (action === 'samples') {
      const bot = body?.bot_username || new URL(req.url).searchParams.get('bot_username');
      const limit = Number(body?.limit ?? 20);
      const q = supabase.from('blackbox_parser_samples')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(limit);
      const { data, error } = bot ? await q.eq('bot_username', bot) : await q;
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, samples: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- INGEST: called by blackbox-tick during passive capture ----
    if (action === 'ingest') {
      const saved = await ingestMessages(supabase, {
        token_mint: body.token_mint,
        posted_at: body.posted_at,
        messages: body.messages || [],
        source: 'passive',
        probe_run_id: body.probe_run_id ?? null,
      });
      return new Response(JSON.stringify({ ok: true, saved }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- PROBE: manual probe — pick latest insider CA, post, wait, harvest ----
    if (action === 'probe') {
      const { data: cfg } = await supabase
        .from('blackbox_channel_config')
        .select('role, chat_id')
        .eq('enabled', true);
      const blackboxChat = cfg?.find((c: any) => c.role === 'blackbox_group')?.chat_id;
      if (!blackboxChat) {
        return new Response(JSON.stringify({ ok: false, error: 'blackbox_group chat_id not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Pick a CA: explicit override, else latest from telegram_channel_calls.
      let mint: string | null = body?.token_mint || null;
      if (!mint) {
        const { data: latest } = await supabase
          .from('telegram_channel_calls')
          .select('token_mint')
          .not('token_mint', 'is', null)
          .order('message_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        mint = latest?.token_mint || null;
      }
      if (!mint) {
        return new Response(JSON.stringify({ ok: false, error: 'no CA available — pass token_mint or wait for insiders feed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const postedAt = new Date().toISOString();
      const postedId = await sendViaHoldersIntel(Number(blackboxChat), mint);
      if (!postedId) {
        return new Response(JSON.stringify({ ok: false, error: 'CA post failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Wait the harvest window then pull recent messages.
      await new Promise(r => setTimeout(r, HARVEST_WINDOW_MS));

      const { data: mt } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'fetch_recent_messages', channelUsername: String(blackboxChat), limit: 100 },
      });
      const msgs: any[] = mt?.messages || [];
      const saved = await ingestMessages(supabase, {
        token_mint: mint, posted_at: postedAt,
        messages: msgs, source: 'manual_probe', probe_run_id: null,
      });

      return new Response(JSON.stringify({ ok: true, mint, posted_message_id: postedId, samples_saved: saved, total_msgs_fetched: msgs.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, error: `unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[parser-probe] error', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});