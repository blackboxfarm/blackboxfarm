import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { fetchDexBanner } from "../_shared/dexscreener-banner.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const BUCKET = 'holders-intel-banners';

/** Themepack — rotates per call so the queue doesn't all look the same. */
const THEMES: Array<{ id: string; label: string; promptFragment: string }> = [
  {
    id: 'featured',
    label: '⭐ Featured',
    promptFragment: `Top-left corner: a small rectangular gold foil "FEATURED" sticker-tag, slightly tilted (~ -6°), with a thin dark drop-shadow as if physically placed on top of the banner.`,
  },
  {
    id: 'trending',
    label: '📈 Trending',
    promptFragment: `Top-right corner: a small green rubber-stamp "TRENDING" badge with a tiny upward chart-arrow, slightly rotated (~ +5°), with a faint ink-bleed edge and soft shadow so it reads as a stamp pressed onto the banner.`,
  },
  {
    id: 'hot',
    label: '🔥 HOT',
    promptFragment: `Top-right corner: a bold red circular "HOT" stamp, slightly off-axis (~ -8°), with a faint ink-bleed edge and a subtle drop-shadow so it reads as a rubber stamp applied on top of the banner.`,
  },
  {
    id: 'discovery',
    label: '🔍 Discovery',
    promptFragment: `Top-left corner: a small rectangular paper "DISCOVERY" tag with a tiny magnifying-glass glyph, attached with a faux pin in the upper-left, tilted ~ -4°, soft drop-shadow underneath.`,
  },
  {
    id: 'snapshot',
    label: '📸 Snapshot',
    promptFragment: `Top-left corner: a small clean rectangular "SNAPSHOT" sticker-tag with a tiny magnifying-glass glyph, slight tilt (~ -3°), thin dark drop-shadow underneath, no scanlines or filters across the artwork.`,
  },
];

function pickTheme(forced?: string | null): typeof THEMES[number] {
  if (forced) {
    const m = THEMES.find(t => t.id === forced.toLowerCase());
    if (m) return m;
  }
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function buildDecoratorPrompt(theme: typeof THEMES[number], opts: { ticker?: string; risk?: string }): string {
  return `EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original token banner at full visibility and full clarity.

The decorations are an OVERLAY APPLIED ON TOP of the finished banner — like physical stickers, paper tags, or rubber stamps slapped onto a printed poster. They MUST read as a third-party re-packaging of the original artwork, NEVER as part of the original design or as an integrated frame/border.

ABSOLUTELY DO NOT:
- cover, repaint, or modify the central 70% of the banner
- add or alter any mascots, characters, creatures, or scenery
- warp, stretch, recolor, or stylise the source artwork
- add scattered emoji, sparkles, embers, lightning, scanlines, vignettes, or any decorative border that wraps the whole image
- add ANY descriptive text such as risk labels, status phrases, taglines, or sentences — sticker text is limited to the short labels below

ADD only the following overlay elements, each rendered with a clear physical drop-shadow underneath so they read as 3D objects sitting on top of the banner (not as part of it):
- ${theme.promptFragment}
- Bottom-left corner: a small rectangular black "HoldersIntel" wordmark sticker (white text), slightly tilted (~ +3°), with a thin drop-shadow.

No other elements. No emoji. No risk text. No edge sparkles. The corners outside the stickers must remain exactly as in the source image.

Final output: same dimensions as input, JPG-quality, photographic clarity preserved.`;
}

async function urlToDataUri(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch source banner ${r.status}`);
  const ct = r.headers.get('content-type') || 'image/jpeg';
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${ct};base64,${btoa(bin)}`;
}

async function callImageEdit(sourceDataUri: string, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: sourceDataUri } },
        ],
      }],
      modalities: ['image', 'text'],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI image edit ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`No image returned: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

/**
 * Body: { queue_id: string, theme?: string, regenerate?: boolean }
 * Generates a "Featured / Trending / HOT" decorated variant of the row's
 * DexScreener banner and stores the URL on the queue row.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const queueId: string = body.queue_id;
    const themeId: string | undefined = body.theme;
    const regenerate = body.regenerate === true;
    if (!queueId) {
      return new Response(JSON.stringify({ error: 'queue_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: row, error: rowErr } = await supabase
      .from('holders_intel_post_queue')
      .select('id, token_mint, symbol, dex_banner_url, decorated_banner_url, decoration_theme, tweet_text')
      .eq('id', queueId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new Error('queue row not found');

    if (row.decorated_banner_url && !regenerate) {
      return new Response(JSON.stringify({
        success: true, skipped: 'already_decorated',
        decorated_banner_url: row.decorated_banner_url,
        decoration_theme: row.decoration_theme,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Resolve source banner — if not cached, fetch it now.
    let sourceUrl = row.dex_banner_url as string | null;
    if (!sourceUrl) {
      const { url } = await fetchDexBanner(row.token_mint);
      if (!url) throw new Error('No DexScreener banner available for this token');
      sourceUrl = url;
      await assertUpdate(
        supabase
          .from('holders_intel_post_queue')
          .update({ dex_banner_url: sourceUrl })
          .eq('id', queueId),
        'holders_intel_post_queue',
      );
    }

    // 2. Pick a theme (rotated per call unless explicitly forced)
    const theme = pickTheme(themeId);

    // 3. Mine a short risk hint out of tweet_text if present
    let risk: string | undefined;
    const t = row.tweet_text || '';
    const riskMatch = t.match(/Risk[s]?:?\s*([^\n]+)/i);
    if (riskMatch) risk = riskMatch[1].trim().slice(0, 60);

    // 4. Build prompt + run AI edit
    const prompt = buildDecoratorPrompt(theme, { ticker: row.symbol || undefined, risk });
    const sourceDataUri = await urlToDataUri(sourceUrl);
    const editedDataUri = await callImageEdit(sourceDataUri, prompt);

    // 5. Upload
    const base64 = editedDataUri.replace(/^data:image\/\w+;base64,/, '');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${queueId}-${theme.id}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '86400',
    });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const decoratedUrl = pub.publicUrl;

    // 6. Persist
    await assertUpdate(
      supabase
        .from('holders_intel_post_queue')
        .update({
          decorated_banner_url: decoratedUrl,
          decoration_theme: theme.id,
        })
        .eq('id', queueId),
      'holders_intel_post_queue',
    );

    return new Response(JSON.stringify({
      success: true,
      decorated_banner_url: decoratedUrl,
      decoration_theme: theme.id,
      theme_label: theme.label,
      source_banner_url: sourceUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[holders-intel-banner-decorate] error:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});