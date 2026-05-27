// no-lube-push — posts already-composed text to the No Lube channel
// (blackbox_channel_config.role = 'output_channel') via the HoldersIntel bot.
// Markdown first, plaintext fallback so a malformed entity never silently drops.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { text, log_id, override, channel: rawChannel, image_url, cta } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const channel: 'default' | 'public' | 'private' =
      rawChannel === 'public' || rawChannel === 'private' ? rawChannel : 'default';

    const token = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'no bot token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Defense-in-depth: re-check eligibility from the log row.
    if (log_id && !override) {
      const { data: logRow } = await supabase
        .from('no_lube_post_log')
        .select('verdict_class, block_reason, posted')
        .eq('id', log_id)
        .maybeSingle();
      if (logRow && logRow.verdict_class !== 'healthy') {
        return new Response(JSON.stringify({
          ok: false,
          error: `blocked: ${logRow.block_reason || logRow.verdict_class}`,
          verdict_class: logRow.verdict_class,
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Resolve destination chat_id by channel.
    // - default → existing blackbox_channel_config.output_channel (backward compatible)
    // - public / private → no_lube_channel_profiles[kind].telegram_chat_id
    let chatId: string | null = null;
    if (channel === 'default') {
      const { data: cfg } = await supabase
        .from('blackbox_channel_config')
        .select('role, chat_id')
        .eq('role', 'output_channel')
        .maybeSingle();
      chatId = cfg?.chat_id ?? null;
    } else {
      const { data: prof } = await supabase
        .from('no_lube_channel_profiles')
        .select('telegram_chat_id')
        .eq('kind', channel)
        .maybeSingle();
      chatId = prof?.telegram_chat_id ?? null;
    }
    if (!chatId) {
      return new Response(JSON.stringify({
        ok: false,
        error: channel === 'default'
          ? 'output_channel not configured'
          : `No Lube ${channel} channel has no telegram_chat_id set`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { ok: r.ok, json: await r.json() };
    };

    const postPhoto = async (body: Record<string, unknown>) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { ok: r.ok, json: await r.json() };
    };

    // Build optional inline keyboard from cta = { text, url } | [{text,url},...]
    const ctaButtons = Array.isArray(cta) ? cta : (cta && cta.text && cta.url ? [cta] : null);
    const reply_markup = ctaButtons && ctaButtons.length
      ? { inline_keyboard: [ctaButtons.map((b: any) => ({ text: String(b.text), url: String(b.url) }))] }
      : undefined;

    let result: { ok: boolean; json: any };
    if (image_url && typeof image_url === 'string') {
      // Photo path: caption uses Markdown; Telegram caption limit is 1024 — truncate safely.
      const caption = text.length > 1024 ? text.slice(0, 1020) + '…' : text;
      result = await postPhoto({
        chat_id: chatId, photo: image_url, caption,
        parse_mode: 'Markdown', reply_markup,
      });
      if (!(result.ok && result.json.ok)) {
        console.warn('[no-lube-push] sendPhoto markdown failed, retrying plain', result.json);
        const plain = caption.replace(/[*_`\[\]()]/g, '');
        result = await postPhoto({ chat_id: chatId, photo: image_url, caption: plain, reply_markup });
      }
    } else {
      result = await post({
        chat_id: chatId, text, parse_mode: 'Markdown',
        disable_web_page_preview: true, reply_markup,
      });
      if (!(result.ok && result.json.ok)) {
        console.warn('[no-lube-push] markdown failed, retrying plain', result.json);
        const plain = text.replace(/[*_`\[\]()]/g, '');
        result = await post({ chat_id: chatId, text: plain, disable_web_page_preview: true, reply_markup });
      }
    }

    if (!(result.ok && result.json.ok)) {
      return new Response(JSON.stringify({ ok: false, error: result.json }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp posted=true on the log row
    if (log_id) {
      try {
        await supabase.from('no_lube_post_log').update({
          posted: true,
          posted_at: new Date().toISOString(),
          tg_message_id: result.json.result?.message_id ?? null,
        }).eq('id', log_id);
      } catch (e) {
        console.error('[no-lube-push] log update failed', e);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      message_id: result.json.result?.message_id ?? null,
      chat_id: chatId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-push] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});