// telegram-get-chat — resolves a Telegram chat_id (e.g. -1001234567890 or @channelname)
// to a display title + username via the HoldersIntel bot. Used by the No Lube
// channel-profile editor in the admin UI.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { chat_id } = await req.json();
    if (!chat_id || typeof chat_id !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'chat_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'no bot token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const r = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      return new Response(JSON.stringify({ ok: false, error: j.description || 'getChat failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const c = j.result || {};
    return new Response(JSON.stringify({
      ok: true,
      title: c.title || c.username || c.first_name || null,
      username: c.username || null,
      type: c.type || null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});