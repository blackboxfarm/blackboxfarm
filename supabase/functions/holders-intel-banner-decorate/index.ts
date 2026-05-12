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
    promptFragment: `Top-left: a small gold "FEATURED" ribbon with subtle sparkle glints. Add a few faint gold star sparkles drifting along the edges.`,
  },
  {
    id: 'trending',
    label: '📈 Trending',
    promptFragment: `Top-right: a green "TRENDING" badge with a small upward chart-arrow icon and a few lightning bolt accents along the top edge.`,
  },
  {
    id: 'hot',
    label: '🔥 HOT',
    promptFragment: `Top-right: a red "HOT" badge with small flame curls licking up from the bottom corners. Subtle ember sparks scattered along the edges.`,
  },
  {
    id: 'discovery',
    label: '🔍 Discovery',
    promptFragment: `Top-left: a translucent "DISCOVERY" tag with a magnifying-glass icon. Add a faint floating "?" mark in one upper corner.`,
  },
  {
    id: 'snapshot',
    label: '📸 Snapshot',
    promptFragment: `Top-left: a small clean "SNAPSHOT" badge with a magnifying-glass icon. Subtle scanline texture across the top 8% of the canvas.`,
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
  const tickerLine = opts.ticker ? `Token: $${opts.ticker}.` : '';
  const riskBadge = opts.risk
    ? `Bottom-right: a small dark badge with the text "${opts.risk}".`
    : `Bottom-right: a small dark badge with the text "No obvious risks detected".`;

  return `EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original token banner at full visibility. Treat this as a TRANSPARENT DECORATIVE OVERLAY around the EDGES and CORNERS only.

ABSOLUTELY DO NOT: cover the central 65% of the banner; replace or repaint the source artwork; add new mascots / characters / creatures; warp or stretch the source.

${tickerLine}

ADD as semi-transparent decorative elements layered ONLY around the edges and corners (60–80% opacity, banner shows through):
- ${theme.promptFragment}
- Bottom-left: a small "HoldersIntel" wordmark with a tiny chat-bubble avatar icon to its left.
- A scattered border of small varied memecoin-style emoji (rocket, fire, eyes, magnifier, money-bag) along the very edges only — never in the central area.
- ${riskBadge}
- A faint subtle vignette so the corners are slightly darker than the centre.

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