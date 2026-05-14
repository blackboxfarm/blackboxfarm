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
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const BUCKET = 'autopsy-banners';

function buildOverlayPrompt(visualDesc: string, opts: { squareSource?: boolean } = {}): string {
  const desc = visualDesc?.trim() || 'the original token banner artwork';
  const squarePreamble = opts.squareSource
    ? `The source image is ALREADY a wide 1536×512 banner with the pump.fun mint artwork letterboxed centered on a black background. PRESERVE the central mint artwork pixel-faithfully (do not redraw it, do not stretch it, do not move it). Decorate the BLACK SIDE PANELS only with the autopsy props described below. Do NOT generate any new characters, mascots, or scenes over the central mint artwork.\n\n`
    : '';
  return `${squarePreamble}EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original banner (${desc}) at full visibility. CRITICAL: keep the EXACT same wide 3:1 banner aspect ratio (1536×512) as the input image — do NOT crop to a square, do NOT pad, do NOT change dimensions. Output must be a wide horizontal banner identical in shape to the input. Treat this as a TRANSPARENT FORENSIC OVERLAY decorating the EDGES and CORNERS only.

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

Final output: identical wide 1536×512 (3:1) banner shape as the input. Never square.`;
}

async function fetchSourceBanner(
  mint: string,
  opts: { curveDeath?: boolean; supabase?: any } = {},
): Promise<{ url: string | null; visualDesc: string }> {
  // Curve deaths (Lambs) almost never have a DexScreener page.
  // Source the mint image directly from pumpfun_watchlist, then pump.fun API.
  if (opts.curveDeath) {
    if (opts.supabase) {
      try {
        const { data } = await opts.supabase
          .from('pumpfun_watchlist')
          .select('image_url, token_name')
          .eq('token_mint', mint)
          .maybeSingle();
        if (data?.image_url) {
          return {
            url: data.image_url,
            visualDesc: data?.token_name ? `the pump.fun mint artwork for ${data.token_name}` : 'the pump.fun mint artwork',
          };
        }
      } catch (_) { /* fallthrough */ }
    }
    try {
      const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`);
      if (r.ok) {
        const j = await r.json();
        const img = j?.image_uri;
        if (img) return { url: img, visualDesc: j?.name ? `the pump.fun mint artwork for ${j.name}` : 'the pump.fun mint artwork' };
      }
    } catch (_) { /* fallthrough */ }
    // Lamb fallback: no image. Caller will use silhouette default.
    return { url: null, visualDesc: 'an unknown pump.fun token (mint image unavailable)' };
  }

  // Default path (post-graduation tokens): DexScreener → pump.fun.
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (BlackBoxFarm/Autopsy)' },
    });
    console.log(`[fetchSourceBanner] DexScreener status=${r.status} for ${mint}`);
    if (r.ok) {
      const j = await r.json();
      const pair = j?.pairs?.[0];
      const header = pair?.info?.header || pair?.info?.openGraph;
      const name = pair?.baseToken?.name;
      console.log(`[fetchSourceBanner] DexScreener pairs=${j?.pairs?.length || 0} header=${header || 'none'}`);
      if (header) return { url: header, visualDesc: name ? `the official banner for ${name}` : 'the official token banner' };
    } else {
      const t = await r.text().catch(() => '');
      console.log(`[fetchSourceBanner] DexScreener body=${t.slice(0, 200)}`);
    }
  } catch (_) { /* fallthrough */ }

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

/**
 * Pre-letterbox the source onto a 1536×512 black canvas IF it isn't already
 * a wide banner (>= 2.4:1). Gemini reliably preserves the INPUT aspect ratio,
 * so giving it a 3:1 input is the only dependable way to force a 3:1 output.
 * Without this, square mint art = square AI output every time.
 * Returns { dataUri, wasLetterboxed }.
 */
async function loadAndMaybeLetterbox(srcUrl: string): Promise<{ dataUri: string; wasLetterboxed: boolean }> {
  const r = await fetch(srcUrl);
  if (!r.ok) throw new Error(`fetch source banner ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const src = await Image.decode(buf);
  const aspect = src.width / src.height;
  // Already a wide banner? Pass through original bytes (preserves quality).
  if (aspect >= 2.4) {
    const ct = r.headers.get('content-type') || 'image/jpeg';
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { dataUri: `data:${ct};base64,${btoa(bin)}`, wasLetterboxed: false };
  }
  const TARGET_W = 1536;
  const TARGET_H = 512;
  const scale = TARGET_H / src.height;
  const newW = Math.round(src.width * scale);
  const resized = src.resize(newW, TARGET_H);
  const canvas = new Image(TARGET_W, TARGET_H);
  canvas.fill(0x000000ff);
  const offsetX = Math.round((TARGET_W - newW) / 2);
  canvas.composite(resized, offsetX, 0);
  const out = await canvas.encodeJPEG(92);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < out.length; i += chunk) {
    bin += String.fromCharCode(...out.subarray(i, i + chunk));
  }
  return { dataUri: `data:image/jpeg;base64,${btoa(bin)}`, wasLetterboxed: true };
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
    let { slug, token_mint, ticker, token_visual_description, report_id, source_feed, force, source_banner_override } =
      await req.json();

    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Backfill token_mint / source_feed / report_id from autopsy_reports if
    // caller only supplied { slug, force: true } (e.g. holders-intel-autopsy-now).
    if (!token_mint) {
      const { data: rep } = await supabase
        .from('autopsy_reports')
        .select('id, token_mint, ticker, candidate_id')
        .eq('slug', slug)
        .maybeSingle();
      if (rep) {
        token_mint = token_mint || rep.token_mint;
        report_id = report_id || rep.id;
        ticker = ticker || rep.ticker;
        if (!source_feed && rep.candidate_id) {
          const { data: cand } = await supabase
            .from('autopsy_candidates')
            .select('source_feed')
            .eq('id', rep.candidate_id)
            .maybeSingle();
          if (cand?.source_feed) source_feed = cand.source_feed;
        }
      }
    }
    if (!token_mint) {
      return new Response(JSON.stringify({ error: 'token_mint not resolvable for slug', slug }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Skip if banner already exists in storage ──
    // The treatment is deterministic per slug — never regenerate.
    const path = `${slug}-autopsy-v2.jpg`;
    if (force) {
      try {
        await supabase.storage.from(BUCKET).remove([path]);
        console.log(`[autopsy-banner-overlay] force=true, removed existing ${path}`);
      } catch (e) {
        console.warn('[autopsy-banner-overlay] force remove failed:', (e as any)?.message);
      }
    }
    try {
      if (force) throw new Error('skip-existence-check');
      const { data: existing } = await supabase.storage.from(BUCKET).list('', {
        search: path, limit: 1,
      });
      if (existing && existing.some((f: any) => f.name === path)) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const heroImageUrl = pub.publicUrl;
        if (report_id) {
          await supabase.from('autopsy_reports').update({
            hero_image_path: heroImageUrl,
          }).eq('id', report_id);
        }
        try {
          await supabase
            .from('holders_intel_post_queue')
            .update({ autopsy_hero_image: heroImageUrl })
            .eq('autopsy_slug', slug);
        } catch (_) { /* best-effort */ }
        console.log(`[autopsy-banner-overlay] reusing existing banner: ${heroImageUrl}`);
        return new Response(JSON.stringify({
          success: true, skipped: 'already_exists', slug, hero_image_url: heroImageUrl,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      console.warn('[autopsy-banner-overlay] existence check failed, continuing:', (e as any)?.message);
    }

    // 1. Source banner — only pre-graduation curve deaths skip DexScreener,
    // because they don't have a DexScreener page. Admin-manual triggers should
    // try the DexScreener header FIRST (real banner art) and only fall back to
    // the pump.fun mint image when no header exists. fetchSourceBanner already
    // implements that fallback chain when curveDeath=false.
    let sourceBannerUrl: string | null = null;
    let visualDesc = 'the original token banner artwork';
    if (source_banner_override) {
      sourceBannerUrl = source_banner_override;
      visualDesc = `the official ${ticker || 'token'} banner`;
      console.log(`[autopsy-banner-overlay] using source_banner_override: ${sourceBannerUrl}`);
    } else {
      const useMintImage = source_feed === 'pumpfun_curve_death';
      const fetched = await fetchSourceBanner(token_mint, { curveDeath: useMintImage, supabase });
      sourceBannerUrl = fetched.url;
      visualDesc = fetched.visualDesc;
    }
    if (!sourceBannerUrl) {
      return new Response(JSON.stringify({ error: 'No source banner available for token', token_mint }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[autopsy-banner-overlay] source banner for ${ticker || token_mint}: ${sourceBannerUrl}`);

    // 2. Always inspect source aspect ratio. If it's not already wide (>=2.4:1)
    // we pre-letterbox onto 1536×512 black canvas so Gemini preserves the 3:1
    // shape. DexScreener sometimes returns square crops (e.g. SP token), so
    // checking source_feed alone isn't enough.
    const { dataUri: sourceDataUri, wasLetterboxed } = await loadAndMaybeLetterbox(sourceBannerUrl);
    console.log(`[autopsy-banner-overlay] source letterboxed=${wasLetterboxed}`);
    const prompt = buildOverlayPrompt(token_visual_description || visualDesc, { squareSource: wasLetterboxed });
    const editedDataUri = await callImageEdit(sourceDataUri, prompt);

    // 3. Upload to bucket
    const base64 = editedDataUri.replace(/^data:image\/\w+;base64,/, '');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '86400',
    });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    let heroImageUrl = pub.publicUrl;

    // 3b. Stamp the @Dead_Tokens pill as a deterministic post-process layer.
    // Best-effort: if the stamp fails, we keep the un-stamped banner.
    try {
      const { data: stampRes } = await supabase.functions.invoke('autopsy-banner-stamp-pill', {
        body: { slug },
      });
      const stampedUrl = stampRes?.results?.[slug]?.url;
      if (stampedUrl) heroImageUrl = stampedUrl;
    } catch (e) {
      console.warn('[autopsy-banner-overlay] stamp-pill chain failed:', (e as any)?.message);
    }

    // 4. Persist to DB rows if requested
    if (report_id) {
      await supabase.from('autopsy_reports').update({
        hero_image_path: heroImageUrl,
        source_banner_url: sourceBannerUrl,
      }).eq('id', report_id);
    }

    // 4b. Backfill any holders_intel_post_queue rows that triggered this autopsy
    // (parent function may have timed out before reading hero_image_path).
    try {
      await supabase
        .from('holders_intel_post_queue')
        .update({ autopsy_hero_image: heroImageUrl })
        .eq('autopsy_slug', slug);
    } catch (e) {
      console.warn('[autopsy-banner-overlay] queue backfill failed:', (e as any)?.message);
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