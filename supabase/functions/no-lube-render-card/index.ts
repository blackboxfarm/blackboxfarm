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
      profile_kind = 'public',
      show_url = false,
      url_to_show = null,
      show_ca = true,
    } = await req.json();

    if (!mint || !ticker || !multiplier) {
      return new Response(JSON.stringify({ ok: false, error: 'mint, ticker, multiplier required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Hard validation: refuse to render without both market caps.
    if (entry_mcap == null || !isFinite(Number(entry_mcap)) || Number(entry_mcap) <= 0 ||
        current_mcap == null || !isFinite(Number(current_mcap)) || Number(current_mcap) <= 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'missing_mcap_invariant',
        detail: { entry_mcap, current_mcap },
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    // Pick assets matching language OR universal OR null. Previous `.or()` had a
    // bug that always matched universal because of the language.is.null clause
    // combined with un-escaped interpolation. Switch to a clean filter chain.
    const langSafe = String(language || 'universal').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    const { data: assetRows } = await supabase
      .from('no_lube_assets')
      .select('id, category, public_url, last_used_at, times_used')
      .eq('enabled', true)
      .or(`language.eq.${langSafe},language.eq.universal,language.is.null`)
      .in('category', ['character', 'background', 'sticker'])
      .limit(80);

    const pool = (assetRows || []) as Array<{
      id: string; category: string; public_url: string;
      last_used_at: string | null; times_used: number | null;
    }>;
    // Prefer assets not used in the last 24h, then least-used overall, then random tie-breaker.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const pick = (cat: string) => {
      const sub = pool.filter(a => a.category === cat);
      if (!sub.length) return null;
      sub.sort((a, b) => {
        const aFresh = !a.last_used_at || new Date(a.last_used_at).getTime() < dayAgo ? 0 : 1;
        const bFresh = !b.last_used_at || new Date(b.last_used_at).getTime() < dayAgo ? 0 : 1;
        if (aFresh !== bFresh) return aFresh - bFresh;
        const au = a.times_used ?? 0, bu = b.times_used ?? 0;
        if (au !== bu) return au - bu;
        return Math.random() - 0.5;
      });
      return sub[0];
    };
    const refs = [pick('character'), pick('background'), pick('sticker')].filter(Boolean) as
      Array<{ id: string; category: string; public_url: string }>;

    // Landscape 1024x640 — matches the standard Telegram link-preview ratio
    // and the user-supplied reference cards (ss1/ss2).
    const caShort = `${mint.slice(0, 6)}…${mint.slice(-6)}`;
    const strictBlock = [
      `"$${ticker}"`,
      `"${multiplier}x"`,
      `"$${Math.round(Number(entry_mcap) / 1000)}k"`,
      `"$${Math.round(Number(current_mcap) / 1000)}k"`,
    ].join(', ');

    const urlLine = show_url && url_to_show
      ? `- Small bottom-right CTA URL inside its own rounded pill: "${url_to_show}"`
      : '';
    const caLine = show_ca
      ? `- Footer CA inside a small dark rounded pill (small grey text): "${caShort}"`
      : '';

    const promptText = `Generate a horizontal landscape (1024x640) Telegram-ready alert card.

${STYLE_GUIDE}

SUBJECT: Token "$${ticker}" hit ${multiplier}x — display ${multiplier}x as the dominant typographic element (huge cyan glow, lowercase x), and feature the token's MINT PROFILE IMAGE prominently as a circular avatar on the left side (the first attached image is the token's real mint PFP — you MUST include it visibly, do not omit it, do not replace it with a generic icon). Include a small whimsical mascot character (drawn in the style of the reference images) celebrating the gain.

STRICT TEXT — render EXACTLY these strings, do NOT translate, abbreviate, or modify a single character (note the lowercase x in the multiplier): ${strictBlock}. Misspelling the ticker or changing the x to X is a render failure.

TEXT LAYOUT (clean, large, mobile-readable). Each labeled text element below must sit inside its own subtle ROUNDED PILL BOX — dark translucent fill, soft rounded corners, and a thin slightly-raised 1px border (a faint top highlight + faint bottom shadow to suggest a raised button). Pills should feel like premium HUD chips, not loud buttons:
- "$${ticker}" in a pill
- "${multiplier}x" — keep this as the dominant element; the pill around it can be larger and more prominent
- "Entry: $${Math.round((entry_mcap || 0) / 1000)}k  →  Now: $${Math.round((current_mcap || 0) / 1000)}k" (entry and now can each be in their own smaller pill)
- Small footer text: "${channel_brand}"
- Token mint PFP rendered as a circular avatar (use the first attached image — this is REQUIRED and must be clearly visible)
${caLine}
${urlLine}

Language flavor for any incidental text: ${language}.
Do NOT include QR codes. Do NOT add any text other than what is listed above.`;

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

    // Stamp usage on the picked assets — increment times_used + bump last_used_at.
    if (refs.length) {
      const ids = refs.map(r => r.id);
      const nowIso = new Date().toISOString();
      // Per-row update so we can increment times_used atomically client-side.
      for (const r of refs) {
        const { data: cur } = await supabase
          .from('no_lube_assets')
          .select('times_used')
          .eq('id', r.id)
          .maybeSingle();
        const next = (cur?.times_used ?? 0) + 1;
        await supabase.from('no_lube_assets')
          .update({ times_used: next, last_used_at: nowIso })
          .eq('id', r.id);
      }
      // Archive render to no_lube_card_renders (best-effort).
      try {
        await supabase.from('no_lube_card_renders').insert({
          profile_kind,
          language,
          token_mint: mint,
          ticker,
          multiplier,
          entry_mcap,
          current_mcap,
          asset_ids: ids,
          prompt: promptText,
          output_url: publicUrl,
          ai_used: true,
        });
      } catch (e) {
        console.warn('[render-card] archive insert failed', e);
      }
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