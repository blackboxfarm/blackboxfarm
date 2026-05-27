// no-lube-render-card — generates a branded AI image card for public 2x+ posts.
// Uses Lovable AI Gateway (gemini-3-pro-image-preview) with the token's real mint
// PFP and a small random sample of library assets as visual references.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STYLE_GUIDE = `BLACKBOX visual style:
- Matte black background, slight grain
- Cyan neon primary glow, gold secondary accents
- Minimal cyberpunk / financial-intelligence aesthetic
- Bloomberg Terminal meets Tron HUD
- Token mint image (provided) shown prominently as the subject
- Huge typographic multiplier accent (e.g. "8X") in bold cyan
- Clean spacing, mobile-readable, premium not cheap
- NOT rainbow neon, NOT cluttered memecoin spam`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const {
      mint, ticker, multiplier, entry_mcap, current_mcap,
      language = 'en', channel_brand = 'No Lube Alpha', token_image_url,
    } = await req.json();

    if (!mint || !ticker || !multiplier) {
      return new Response(JSON.stringify({ ok: false, error: 'mint, ticker, multiplier required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'LOVABLE_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pick up to 3 enabled assets (1 character + optional background) matching language or universal.
    const { data: assetRows } = await supabase
      .from('no_lube_assets')
      .select('id, category, public_url')
      .eq('enabled', true)
      .or(`language.eq.${language},language.is.null,language.eq.universal`)
      .in('category', ['character', 'background', 'sticker'])
      .limit(50);

    const pool = (assetRows || []) as Array<{ id: string; category: string; public_url: string }>;
    const pick = (cat: string) => {
      const sub = pool.filter(a => a.category === cat);
      return sub.length ? sub[Math.floor(Math.random() * sub.length)] : null;
    };
    const refs = [pick('character'), pick('background'), pick('sticker')].filter(Boolean) as
      Array<{ id: string; category: string; public_url: string }>;

    const promptText = `Generate a vertical (1024x1536) Telegram-ready alert card.

${STYLE_GUIDE}

SUBJECT: Token "$${ticker}" hit ${multiplier}X — display ${multiplier}X as the dominant typographic element (huge cyan glow), and feature the token's mint image prominently. Include a small whimsical mascot character (drawn in the style of the reference images) celebrating the gain.

TEXT TO RENDER ON CARD (clean, large, mobile-readable):
- "$${ticker}"
- "${multiplier}X"
- "Entry: $${Math.round((entry_mcap || 0) / 1000)}k  →  Now: $${Math.round((current_mcap || 0) / 1000)}k"
- Small footer: "${channel_brand}"

Language flavor for any incidental text: ${language}.
Do NOT include URLs, contract addresses, or QR codes.`;

    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: promptText }];
    if (token_image_url) {
      userContent.push({ type: 'image_url', image_url: { url: token_image_url } });
    }
    for (const r of refs) {
      userContent.push({ type: 'image_url', image_url: { url: r.public_url } });
    }

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: userContent }],
        modalities: ['image', 'text'],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[render-card] AI gateway error', aiResp.status, t);
      return new Response(JSON.stringify({ ok: false, error: `AI ${aiResp.status}`, detail: t }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const dataUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      console.error('[render-card] no image in response', JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ ok: false, error: 'no image returned' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decode data URL → bytes → upload to storage
    const [, b64] = dataUrl.split(',');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const filename = `${Date.now()}_${mint.slice(0, 8)}_${multiplier}x.png`;
    const { error: upErr } = await supabase.storage
      .from('no-lube-rendered-cards')
      .upload(filename, bytes, { contentType: 'image/png', upsert: false });
    if (upErr) {
      console.error('[render-card] upload error', upErr);
      return new Response(JSON.stringify({ ok: false, error: `upload: ${upErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: pub } = supabase.storage.from('no-lube-rendered-cards').getPublicUrl(filename);
    const publicUrl = pub.publicUrl;

    // Stamp usage on the picked assets (best-effort)
    if (refs.length) {
      const ids = refs.map(r => r.id);
      try {
        await supabase.rpc('increment'); // placeholder — falls through silently
      } catch (_) { /* ignore */ }
      await supabase.from('no_lube_assets')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', ids);
    }

    return new Response(JSON.stringify({
      ok: true,
      image_url: publicUrl,
      prompt: promptText,
      assets_used: refs.map(r => r.id),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-render-card] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});