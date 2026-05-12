import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { fetchDexBanner } from "../_shared/dexscreener-banner.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const BUCKET = 'holders-intel-banners';

/**
 * Themepack — rotates per call so the queue doesn't all look the same.
 * Each theme is a physical "artifact object" (no advertising/grade text)
 * that is dropped onto the corner of the original banner like a stamp,
 * sticker, or stage prop.
 */
const THEMES: Array<{ id: string; label: string; promptFragment: string }> = [
  {
    id: 'report_card',
    label: '📋 Report Card',
    promptFragment: `Top-left corner: a small old-school cream paper "REPORT CARD" — a folded school report card prop, slightly worn at the edges, tilted ~ -5°. Show the title "REPORT CARD" only — DO NOT print any grade, score, letter, percentage, ranking, or evaluative text on it. Cast a soft physical drop-shadow underneath so it reads as a paper artifact resting on top of the banner.`,
  },
  {
    id: 'magnifying_glass',
    label: '🔍 Magnifying Glass',
    promptFragment: `Top-left corner: a small antique brass magnifying glass laid diagonally (~ -25°) with a sliver of yellow measuring-tape unspooling beside it. Both objects cast realistic drop-shadows on the banner. No text labels of any kind on either object.`,
  },
  {
    id: 'balance_scale',
    label: '⚖️ Balance Scale',
    promptFragment: `Top-left corner: a small antique brass balance scale prop with two empty pans, sitting upright at a slight 3D angle, casting a soft drop-shadow on the banner. No text, no labels — just the object as a physical decoration on top of the artwork.`,
  },
  {
    id: 'blueprint',
    label: '📐 Blueprint',
    promptFragment: `Top-left corner: a small partially unrolled architect's blueprint scroll (deep blue paper with faint white grid lines) tied with a thin string, tilted ~ -4°, with a clean drop-shadow underneath. No legible text on the blueprint, just suggestion of grid lines and faint sketches.`,
  },
  {
    id: 'paper_map',
    label: '🗺️ Paper Map',
    promptFragment: `Top-left corner: a small folded paper map partially opened, slightly creased, in muted vintage tones, tilted ~ +4°, with a clean drop-shadow. Map shows abstract roads/contours only — DO NOT print any town names, place names, or readable text.`,
  },
  {
    id: 'poker',
    label: '🃏 Poker',
    promptFragment: `Top-left corner: a small fan of two playing cards (face down or generic backs) overlapping a stack of two or three gold-and-black poker chips, casting a clear drop-shadow on the banner. No suit faces with text, no chip denomination text — purely decorative casino objects.`,
  },
];

function pickTheme(forced?: string | null): typeof THEMES[number] {
  if (forced) {
    const m = THEMES.find(t => t.id === forced.toLowerCase());
    if (m) return m;
  }
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function buildDecoratorPrompt(theme: typeof THEMES[number]): string {
  return `EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original token banner at full visibility and full clarity.

The decorations are PHYSICAL ARTIFACT OBJECTS placed ON TOP of the finished banner — like real props laid onto a printed poster. They MUST read as a third-party re-packaging of the original artwork, NEVER as part of the original design or as an integrated frame/border.

ABSOLUTELY DO NOT:
- cover, repaint, or modify the central 70% of the banner
- add or alter any mascots, characters, creatures, or scenery
- warp, stretch, recolor, or stylise the source artwork
- add scattered emoji, sparkles, embers, lightning, scanlines, vignettes, or any decorative border that wraps the whole image
- add ANY descriptive text — no risk labels, no "no obvious risks", no status phrases, no grades, no taglines, no sentences
- use the words "FEATURED", "TRENDING", "HOT", "DISCOVERY", "SNAPSHOT", "VERIFIED", "APPROVED", or any advertising phrase ANYWHERE on the image

ADD only the following overlay elements, each rendered with a clear physical drop-shadow underneath so they read as 3D objects sitting on top of the banner (not as part of it):
- ${theme.promptFragment}
- Bottom-left corner: the second image you were given (a small circular AI avatar) placed as a small round badge ~64–96px wide, immediately followed to its right by the wordmark "@HoldersIntel" in clean white sans-serif text on a thin translucent dark pill, slightly tilted (~ +2°), with a soft drop-shadow.

No other elements. No emoji decorations. No risk text. No edge sparkles. The corners outside these placed objects must remain exactly as in the source image.

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

async function callImageEdit(sourceDataUri: string, avatarDataUri: string | null, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');
  const content: any[] = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: sourceDataUri } },
  ];
  if (avatarDataUri) {
    content.push({ type: 'image_url', image_url: { url: avatarDataUri } });
  }
  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content }],
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
    const action: string | undefined = body.action;
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

    // Delete action: clear decoration + remove storage object
    if (action === 'delete') {
      if (row.decorated_banner_url) {
        try {
          const m = row.decorated_banner_url.match(/\/holders-intel-banners\/(.+)$/);
          const path = m?.[1];
          if (path) await supabase.storage.from(BUCKET).remove([path]);
        } catch (e) {
          console.warn('[decorate:delete] storage remove failed', (e as Error).message);
        }
      }
      await assertUpdate(
        supabase
          .from('holders_intel_post_queue')
          .update({ decorated_banner_url: null, decoration_theme: null })
          .eq('id', queueId),
        'holders_intel_post_queue',
      );
      return new Response(JSON.stringify({ success: true, deleted: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // 3. Build prompt + run AI edit (pass Signal avatar as 2nd image)
    const prompt = buildDecoratorPrompt(theme);
    const sourceDataUri = await urlToDataUri(sourceUrl);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\./)?.[1];
    const siteOrigin = projectRef
      ? `https://${projectRef}.lovable.app`
      : 'https://blackbox.farm';
    let avatarDataUri: string | null = null;
    try {
      avatarDataUri = await urlToDataUri('https://blackbox.farm/signal-avatar.png');
    } catch (e) {
      console.warn('[decorate] avatar fetch failed:', (e as Error).message);
    }
    const editedDataUri = await callImageEdit(sourceDataUri, avatarDataUri, prompt);

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