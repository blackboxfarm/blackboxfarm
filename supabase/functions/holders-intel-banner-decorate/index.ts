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
 * HoldersIntel banner decorations — same technique as autopsy-banner-overlay
 * (forensic transparent overlay): preserve the central artwork untouched and
 * scatter SEVERAL semi-transparent "research artifact" props across all four
 * corners so the result reads as a third-party re-packaging of the original.
 * Theme just biases the dominant prop; supporting props are always present.
 */
const THEMES: Array<{ id: string; label: string; hero: string }> = [
  { id: 'report_card',     label: '📋 Report Card',     hero: 'cream paper "REPORT CARD" school report card with header lines and ruled rows (no grades, no scores, no letters)' },
  { id: 'magnifying_glass',label: '🔍 Magnifying Glass',hero: 'antique brass magnifying glass laid diagonally over a small length of unspooled yellow measuring tape' },
  { id: 'balance_scale',   label: '⚖️ Balance Scale',  hero: 'antique brass balance scale with two empty pans at a slight 3D angle' },
  { id: 'blueprint',       label: '📐 Blueprint',       hero: 'partially unrolled architect blueprint scroll, deep blue paper with faint white grid lines, tied with thin string' },
  { id: 'paper_map',       label: '🗺️ Paper Map',      hero: 'folded vintage paper map partially opened, creased, abstract roads and contours' },
  { id: 'poker',           label: '🃏 Poker',           hero: 'fan of two face-down playing cards overlapping a stack of three gold-and-black poker chips' },
];

function pickTheme(forced?: string | null): typeof THEMES[number] {
  if (forced) {
    const m = THEMES.find(t => t.id === forced.toLowerCase());
    if (m) return m;
  }
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function buildDecoratorPrompt(theme: typeof THEMES[number], visualDesc: string): string {
  return `EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original banner (${visualDesc}) at full visibility. Treat this as a TRANSPARENT RESEARCH OVERLAY decorating the EDGES and CORNERS only.

ABSOLUTELY DO NOT: add any mascot/character/creature; cover the central 60% of the banner; replace or repaint the source banner; place any large stencil over the central subject.

DO ADD as semi-transparent decorative elements layered ONLY around the edges and corners (60–75% opacity, banner shows through):
- Top-left: ${theme.hero}, tilted slightly, soft drop-shadow
- Top-right: small complementary research prop (magnifying glass, measuring tape, blueprint corner, paper-map corner, or balance scale — NOT the same as top-left)
- Bottom-right: second complementary prop (different again from top-left and top-right)
- Bottom-left: a small circular glowing teal/cyan ethereal humanoid avatar badge (a soft luminous wisp-like figure on dark background, ~80px round) immediately followed to its right by the white sans-serif wordmark "@HoldersIntel" on a thin translucent dark pill, slight tilt, soft drop-shadow

Final output: same dimensions as input, photographic clarity preserved.`;
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
      model: 'google/gemini-3-pro-image-preview',
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

    // 3. Build prompt + run AI edit. We describe the Signal avatar in-prompt
    // (a glowing teal wisp humanoid) rather than passing a 2nd image — the
    // model handles single-image edits much more reliably than multi-image
    // composites, which is why the autopsy version produces clean results.
    const visualDesc = row.symbol
      ? `the official $${row.symbol} token banner`
      : 'the official token banner';
    const prompt = buildDecoratorPrompt(theme, visualDesc);
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