/**
 * autopsy-banner-stamp-pill
 *
 * Composites the @Dead_Tokens pill (circular avatar + handle) onto an
 * existing autopsy banner in the `autopsy-banners` storage bucket.
 * Pure pixel composite via ImageScript — no AI calls, deterministic, cheap.
 *
 * Body: { slug?: string, report_id?: string, all_missing?: boolean }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { Image, decode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { DEADTOKENS_AVATAR_B64 } from './avatar-b64.ts';
import { rebrandImage } from '../_shared/exif-rebrand.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'autopsy-banners';
const FONT_URL = 'https://github.com/googlefonts/RobotoSlab/raw/main/fonts/ttf/RobotoSlab-Bold.ttf';

let cachedAvatar: Uint8Array | null = null;
let cachedFont: Uint8Array | null = null;

async function getAvatar(): Promise<Uint8Array> {
  if (cachedAvatar) return cachedAvatar;
  // Embedded 128x128 PNG — no network dependency, deterministic.
  cachedAvatar = Uint8Array.from(atob(DEADTOKENS_AVATAR_B64), (c) => c.charCodeAt(0));
  return cachedAvatar;
}
async function getFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const r = await fetch(FONT_URL);
  if (!r.ok) throw new Error(`font fetch ${r.status}`);
  cachedFont = new Uint8Array(await r.arrayBuffer());
  return cachedFont;
}

/** Circular alpha-mask an image in place. */
function maskCircle(img: Image): Image {
  const w = img.width, h = img.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy);
  const r2 = r * r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) {
        img.setPixelAt(x + 1, y + 1, 0x00000000);
      }
    }
  }
  return img;
}

/** Build a black rounded-pill image of given dims. */
function buildPill(w: number, h: number, color = 0x0a0a0aff): Image {
  const img = new Image(w, h).fill(color);
  const r = h / 2;
  const r2 = r * r;
  // Knock out left semicircle corners
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < r; x++) {
      const dx = x - r + 0.5, dy = y - r + 0.5;
      if (dx * dx + dy * dy > r2) img.setPixelAt(x + 1, y + 1, 0x00000000);
    }
    // right semicircle
    for (let x = w - r; x < w; x++) {
      const dx = x - (w - r) + 0.5, dy = y - r + 0.5;
      if (dx * dx + dy * dy > r2) img.setPixelAt(x + 1, y + 1, 0x00000000);
    }
  }
  return img;
}

async function stampOne(supabase: any, slug: string): Promise<string> {
  const path = `${slug}-autopsy-v2.jpg`;
  // Pull ticker for branded EXIF
  let ticker: string | null = null;
  try {
    const { data: rep } = await supabase
      .from('autopsy_reports')
      .select('ticker')
      .eq('slug', slug)
      .maybeSingle();
    ticker = rep?.ticker ?? null;
  } catch (_) { /* best-effort */ }
  // download existing banner
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
  if (dlErr || !blob) throw new Error(`download ${path}: ${dlErr?.message || 'missing'}`);
  const bannerBytes = new Uint8Array(await blob.arrayBuffer());
  const banner = await decode(bannerBytes) as Image;

  // avatar (circle) — sized to pill height
  const PILL_H = 72;
  const AVATAR = PILL_H - 12; // 60px
  const avatarBytes = await getAvatar();
  const avatarRaw = await decode(avatarBytes) as Image;
  const avatar = avatarRaw.resize(AVATAR, AVATAR);
  maskCircle(avatar);

  // text
  const fontBytes = await getFont();
  const text = Image.renderText(fontBytes, 32, '@Dead_Tokens', 0xffffffff);
  const PAD_L = AVATAR + 18; // avatar + gap
  const PAD_R = 22;
  const PILL_W = PAD_L + text.width + PAD_R;

  // pill
  const pill = buildPill(PILL_W, PILL_H);
  // composite avatar on left, vertically centered
  pill.composite(avatar, 6, Math.round((PILL_H - AVATAR) / 2));
  // composite text
  pill.composite(text, PAD_L, Math.round((PILL_H - text.height) / 2));

  // place at bottom-left of banner with margin
  const MARGIN = 28;
  const x = MARGIN;
  const y = banner.height - PILL_H - MARGIN;
  banner.composite(pill, x, y);

  const encodedBytes = await banner.encodeJPEG(88);

  // ImageScript's encoder strips ALL metadata. Re-stamp BlackBox Autopsy EXIF
  // before upload so Windows/macOS/Twitter see our copyright on the final file.
  const year = new Date().getFullYear();
  const tickerLabel = ticker ? `$${ticker}` : 'token';
  const copyrightLines = [
    `Copyright (c) ${year} BlackBox Farm — BlackBox Autopsy. All rights reserved.`,
    `Subject: ${tickerLabel} forensic autopsy report — cause of death, harm score, evidence.`,
    `Slogan: We Read The Mesh. Dead Tokens Don't Lie.`,
    `Website: https://blackbox.farm`,
    `Autopsy: https://blackbox.farm/autopsies/${slug}`,
    `Telegram: https://t.me/Dead_Tokens`,
    `X / Twitter: https://x.com/Dead_Tokens`,
    `Source: BlackBox Farm Autopsy Intelligence Platform`,
  ];
  const { bytes: outBytes, mime: outMime } = rebrandImage(encodedBytes, 'image/jpeg', {
    fields: {
      imageDescription: `${tickerLabel} — BlackBox Autopsy decorated forensic banner with @Dead_Tokens signature.`,
      software: 'BlackBox Farm Autopsy Banner Stamp',
      artist: 'BlackBox Farm — BlackBox Autopsy',
      copyright: `Copyright (c) ${year} BlackBox Farm — BlackBox Autopsy. All rights reserved. https://blackbox.farm`,
      xpTitle: `BlackBox Autopsy — ${tickerLabel} Forensic Banner`,
      xpSubject: `${tickerLabel} autopsy — cause of death, harm score, evidence`,
      xpAuthor: 'BlackBox Farm — BlackBox Autopsy',
      xpKeywords: `BlackBox Autopsy;Dead Tokens;BlackBox Farm;Solana;${tickerLabel};Forensics;Rug;Scam;Crypto`,
      xpComment: copyrightLines.join(' | '),
    },
    copyrightLines,
  });
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, outBytes, {
    contentType: outMime || 'image/jpeg', upsert: true, cacheControl: '86400',
  });
  if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // cache-bust
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  await supabase.from('autopsy_reports').update({ hero_image_path: url }).eq('slug', slug);
  return url;
}

Deno.serve(withRunLog('autopsy-banner-stamp-pill', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let slugs: string[] = [];
    if (body.slug) {
      slugs = [body.slug];
    } else if (body.report_id) {
      const { data } = await supabase.from('autopsy_reports').select('slug').eq('id', body.report_id).maybeSingle();
      if (data?.slug) slugs = [data.slug];
    } else if (body.all_missing) {
      const { data } = await supabase
        .from('autopsy_reports')
        .select('slug, hero_image_path')
        .eq('is_current', true)
        .not('hero_image_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      slugs = (data ?? [])
        .filter((r: any) => r.hero_image_path && !String(r.hero_image_path).includes('?v='))
        .map((r: any) => r.slug);
    }

    if (slugs.length === 0) {
      return new Response(JSON.stringify({ error: 'no slug/report_id/all_missing target' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, any> = {};
    for (const slug of slugs) {
      try {
        const url = await stampOne(supabase, slug);
        results[slug] = { ok: true, url };
      } catch (e: any) {
        results[slug] = { ok: false, error: e.message };
        console.error(`[stamp-pill] ${slug}:`, e.message);
      }
    }

    const ok = Object.values(results).filter((r: any) => r.ok).length;
    return new Response(JSON.stringify({ success: true, stamped: ok, total: slugs.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[stamp-pill] fatal:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));