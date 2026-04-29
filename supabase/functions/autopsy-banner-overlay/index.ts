/**
 * autopsy-banner-overlay
 *
 * Generates the BlackBox Autopsy hero banner per docs/autopsy-image-protocol.md (v2):
 *   1. Downloads the source token banner (DexScreener `pairs[0].info.header`,
 *      falling back to pump.fun image / Helius metadata image).
 *   2. Calls Lovable AI image-edit (google/gemini-3-pro-image-preview) with the
 *      locked decorate-don't-cover prompt, passing the source banner as input.
 *   3. Uploads the resulting jpg to the public `autopsy-banners` storage bucket.
 *   4. Returns { hero_image_url, source_banner_url, slug }.
 *
 * Body: { slug: string, token_mint: string, ticker?: string,
 *         token_visual_description?: string, report_id?: string,
 *         report_id?: string }
 *
 * If `report_id` is provided, the row's hero_image_path + source_banner_url
 * are updated automatically.
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const BUCKET = 'autopsy-banners';

function buildOverlayPrompt(visualDesc: string): string {
  const desc = visualDesc?.trim() || 'the original token banner artwork';
  return `EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original banner (${desc}) at full visibility. Treat this as a TRANSPARENT FORENSIC OVERLAY decorating the EDGES and CORNERS only.

ABSOLUTELY DO NOT: add any blob/mascot/character/creature; cover the central 60% of the banner; replace or repaint the source banner; place the AUTOPSY stencil over the central subject.

DO ADD as semi-transparent decorative elements layered ONLY around the edges and corners (60–75% opacity, banner shows through):
- Top-left: vintage CASE FILE coroner report card (faded, redacted black bars)
- Top-right: CAUSE OF DEATH toe-tag report (aged paper)
- Bottom-left: clipboard with DEATH CERTIFICATE, magnifying glass, scalpel
- Bottom-right: barcode + small EVIDENCE red rubber-stamp
- Scattered red skull stamps (small, ~60% opacity) in the dead corners
- One diagonal strip of yellow POLICE LINE / DO NOT CROSS tape across ONE bottom corner only
- A few red blood-spatter flecks around the edges
- Bold red military stencil "BLACKBOX AUTOPSY" rotated -45°, placed in the BOTTOM-RIGHT QUADRANT only, sprayed/distressed edges

Final output 1536×512.`;
}

async function fetchSourceBanner(mint: string): Promise<{ url: string | null; visualDesc: string }> {
  // 1. DexScreener
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (r.ok) {
      const j = await r.json();
      const header = j?.pairs?.[0]?.info?.header;
      const name = j?.pairs?.[0]?.baseToken?.name;
      if (header) return { url: header, visualDesc: name ? `the official banner for ${name}` : 'the official token banner' };
    }
  } catch (_) { /* fallthrough */ }

  // 2. Pump.fun
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`);
    if (r.ok) {
      const j = await r.json();
      const img = j?.image_uri;
      if (img) return { url: img, visualDesc: j?.name ? `the pump.fun artwork for ${j.name}` : 'the pump.fun token artwork' };
    }
  } catch (_) { /* fallthrough */ }

  return { url: null, visualDesc: 'the original token artwork' };
}

async function urlToDataUri(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch source banner ${r.status}`);
  const ct = r.headers.get('content-type') || 'image/jpeg';
  const buf = new Uint8Array(await r.arrayBuffer());
  // base64 encode in chunks (Deno-safe)
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  return `data:${ct};base64,${b64}`;
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
  return url; // data:image/...;base64,...
}

Deno.serve(withRunLog('autopsy-banner-overlay', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!await isFunctionEnabled('autopsy-banner-overlay')) {
    return new Response(JSON.stringify({ skipped: 'disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }

  try {
    const { slug, token_mint, ticker, token_visual_description, report_id } =
      await req.json();

    if (!slug || !token_mint) {
      return new Response(JSON.stringify({ error: 'slug and token_mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Source banner
    const { url: sourceBannerUrl, visualDesc } = await fetchSourceBanner(token_mint);
    if (!sourceBannerUrl) {
      return new Response(JSON.stringify({ error: 'No source banner available for token', token_mint }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[autopsy-banner-overlay] source banner for ${ticker || token_mint}: ${sourceBannerUrl}`);

    // 2. Build prompt + edit
    const prompt = buildOverlayPrompt(token_visual_description || visualDesc);
    const sourceDataUri = await urlToDataUri(sourceBannerUrl);
    const editedDataUri = await callImageEdit(sourceDataUri, prompt);

    // 3. Upload to bucket
    const base64 = editedDataUri.replace(/^data:image\/\w+;base64,/, '');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${slug}-autopsy-v2.jpg`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '86400',
    });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const heroImageUrl = pub.publicUrl;

    // 4. Persist to DB rows if requested
    if (report_id) {
      await supabase.from('autopsy_reports').update({
        hero_image_path: heroImageUrl,
        source_banner_url: sourceBannerUrl,
      }).eq('id', report_id);
    }

    return new Response(JSON.stringify({
      success: true,
      slug,
      hero_image_url: heroImageUrl,
      source_banner_url: sourceBannerUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[autopsy-banner-overlay] error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));