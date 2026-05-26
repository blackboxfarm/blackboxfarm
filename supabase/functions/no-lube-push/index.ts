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
    const { text, log_id, override } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { data: cfg } = await supabase
      .from('blackbox_channel_config')
      .select('role, chat_id')
      .eq('role', 'output_channel')
      .maybeSingle();
    const chatId = cfg?.chat_id;
    if (!chatId) {
      return new Response(JSON.stringify({ ok: false, error: 'output_channel not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { ok: r.ok, json: await r.json() };
    };

    let result = await post({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    if (!(result.ok && result.json.ok)) {
      console.warn('[no-lube-push] markdown failed, retrying plain', result.json);
      const plain = text.replace(/[*_`\[\]()]/g, '');
      result = await post({ chat_id: chatId, text: plain, disable_web_page_preview: true });
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