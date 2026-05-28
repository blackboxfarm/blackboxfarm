// no-lube-compose-card — deterministic template-first card compositor.
//
// Loads the (profile_kind, language) template PNG from no_lube_card_templates,
// composites the token PFP into the mint_pfp safe zone, renders fixed text
// overlays for ticker/CA/multiplier/entry/current into their safe zones, and
// pastes a random character asset into the character zone. No AI call — the
// text strings are baked deterministically so they can NEVER be misspelled or
// translated.
//
// Output: branded JPEG uploaded to no-lube-rendered-cards, archived in
// no_lube_card_renders with template_id + asset_ids + the full input echo.
//
// Input: {
//   profile_kind: 'private' | 'public',
//   language?: string,
//   mint: string,
//   ticker: string,
//   multiplier: number,
//   entry_mcap: number,
//   current_mcap: number,
//   token_image_url?: string,
//   channel_brand?: string,
// }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { Image, decode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { rebrandImage } from '../_shared/exif-rebrand.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CARD_W = 1024;
const CARD_H = 640;
const DEFAULT_FONT_URL = 'https://github.com/googlefonts/RobotoSlab/raw/main/fonts/ttf/RobotoSlab-Bold.ttf';

const fontCache = new Map<string, Uint8Array>();
async function loadFont(url: string): Promise<Uint8Array> {
  if (fontCache.has(url)) return fontCache.get(url)!;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch ${url}: ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  fontCache.set(url, bytes);
  return bytes;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

function maskCircle(img: Image): Image {
  const w = img.width, h = img.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy);
  const r2 = r * r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      if (dx * dx + dy * dy > r2) img.setPixelAt(x + 1, y + 1, 0x00000000);
    }
  }
  return img;
}

function fitContain(img: Image, w: number, h: number): Image {
  const sx = w / img.width;
  const sy = h / img.height;
  const s = Math.min(sx, sy);
  return img.resize(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
}

function pickFontSize(text: string, maxW: number, maxH: number, base = 64): number {
  // crude: ImageScript ttf rendering width ~= size * 0.55 * len for bold display fonts
  const byHeight = Math.min(base, Math.floor(maxH * 0.9));
  const byWidth = Math.floor(maxW / Math.max(1, text.length) / 0.55);
  return Math.max(14, Math.min(byHeight, byWidth));
}

function fmtK(n: number): string {
  if (!isFinite(n) || n <= 0) return '$?';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function caShort(mint: string): string {
  if (mint.length <= 14) return mint;
  return `${mint.slice(0, 6)}…${mint.slice(-6)}`;
}

type SafeZone = { x: number; y: number; w: number; h: number; shape?: string };

function drawTextInZone(canvas: Image, font: Uint8Array, text: string, zone: SafeZone, color = 0xffffffff, baseSize = 64) {
  const size = pickFontSize(text, zone.w, zone.h, baseSize);
  const rendered = Image.renderText(font, size, text, color);
  const dx = zone.x + Math.max(0, Math.round((zone.w - rendered.width) / 2));
  const dy = zone.y + Math.max(0, Math.round((zone.h - rendered.height) / 2));
  canvas.composite(rendered, dx, dy);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      profile_kind = 'public',
      language = 'en',
      mint,
      ticker,
      multiplier,
      entry_mcap,
      current_mcap,
      token_image_url,
      channel_brand = 'No Lube Alpha',
      banner_url = null,
      has_paid_dex = false,
    } = body || {};

    if (!mint || !ticker || !multiplier) {
      return new Response(JSON.stringify({ ok: false, error: 'mint, ticker, multiplier required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!entry_mcap || !current_mcap || Number(entry_mcap) <= 0 || Number(current_mcap) <= 0) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_mcap_invariant', detail: { entry_mcap, current_mcap } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Resolve template — prefer (profile_kind, exact language, enabled), then is_default, then any enabled for kind.
    const langSafe = String(language || 'universal').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'universal';
    let tpl: any = null;
    let selectionReason = 'unknown';
    let rotationMode = 'sticky';
    {
      const { data: settings } = await supabase
        .from('no_lube_channel_settings')
        .select('active_template_id, rotation_mode, last_used_template_id')
        .eq('profile_kind', profile_kind)
        .maybeSingle();
      rotationMode = settings?.rotation_mode || 'sticky';

      const { data } = await supabase.from('no_lube_card_templates')
        .select('*').eq('profile_kind', profile_kind).eq('enabled', true)
        .limit(100);
      const list = (data || []) as any[];
      const langPool = list.filter(t => t.language === langSafe);
      const pool = langPool.length ? langPool : list.filter(t => t.language === 'universal' || !t.language).concat(list);

      if (rotationMode === 'random' && pool.length) {
        tpl = pool[Math.floor(Math.random() * pool.length)];
        selectionReason = `random_from_${pool.length}`;
      } else if (rotationMode === 'round_robin' && pool.length) {
        const lastIdx = settings?.last_used_template_id
          ? pool.findIndex(t => t.id === settings.last_used_template_id) : -1;
        tpl = pool[(lastIdx + 1) % pool.length];
        selectionReason = `round_robin_idx_${(lastIdx + 1) % pool.length}`;
      } else if (settings?.active_template_id) {
        tpl = list.find(t => t.id === settings.active_template_id) || null;
        selectionReason = tpl ? 'sticky_settings' : 'sticky_settings_missing';
      }
      if (!tpl) {
        tpl = pool.find(t => t.is_default) || pool[0] || list.find(t => t.is_default) || list[0] || null;
        if (tpl && selectionReason === 'unknown') selectionReason = 'fallback_default';
      }

      if (tpl && rotationMode === 'round_robin') {
        await supabase.from('no_lube_channel_settings')
          .update({ last_used_template_id: tpl.id, updated_at: new Date().toISOString() })
          .eq('profile_kind', profile_kind);
      }
    }
    console.log('[compose-card] template selected', { profile_kind, language: langSafe, rotation_mode: rotationMode, selection_reason: selectionReason, template_id: tpl?.id });
    if (!tpl) {
      return new Response(JSON.stringify({ ok: false, error: 'no_template', detail: { profile_kind, language: langSafe } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Load template PNG → canvas (resized to 1024x640).
    const tplBytes = await fetchBytes(tpl.template_url);
    if (!tplBytes) {
      return new Response(JSON.stringify({ ok: false, error: 'template_fetch_failed', url: tpl.template_url }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tplImg = await decode(tplBytes) as Image;
    const canvas = tplImg.width === CARD_W && tplImg.height === CARD_H ? tplImg : tplImg.resize(CARD_W, CARD_H);

    const zones = (tpl.safe_zones || {}) as Record<string, SafeZone>;
    const font = await loadFont(tpl.font_url || DEFAULT_FONT_URL);

    // 3. Mint PFP into circle zone.
    if (zones.mint_pfp && token_image_url) {
      const pfpBytes = await fetchBytes(token_image_url);
      if (pfpBytes) {
        try {
          const pfp = await decode(pfpBytes) as Image;
          const resized = pfp.resize(zones.mint_pfp.w, zones.mint_pfp.h);
          if (zones.mint_pfp.shape === 'circle') maskCircle(resized);
          canvas.composite(resized, zones.mint_pfp.x, zones.mint_pfp.y);
        } catch (e) { console.warn('[compose-card] pfp decode failed', e); }
      }
    }

    // 4. Random character asset into character zone (deterministic, no AI).
    let characterAssetId: string | null = null;
    if (zones.character) {
      const { data: assets } = await supabase.from('no_lube_assets')
        .select('id, public_url, last_used_at, times_used')
        .eq('enabled', true).eq('category', 'character')
        .or(`language.eq.${langSafe},language.eq.universal,language.is.null`)
        .limit(60);
      const pool = (assets || []) as any[];
      if (pool.length) {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        pool.sort((a, b) => {
          const af = !a.last_used_at || new Date(a.last_used_at).getTime() < dayAgo ? 0 : 1;
          const bf = !b.last_used_at || new Date(b.last_used_at).getTime() < dayAgo ? 0 : 1;
          if (af !== bf) return af - bf;
          const au = a.times_used ?? 0, bu = b.times_used ?? 0;
          if (au !== bu) return au - bu;
          return Math.random() - 0.5;
        });
        const pick = pool[0];
        const cBytes = await fetchBytes(pick.public_url);
        if (cBytes) {
          try {
            const cImg = await decode(cBytes) as Image;
            const fit = fitContain(cImg, zones.character.w, zones.character.h);
            const dx = zones.character.x + Math.round((zones.character.w - fit.width) / 2);
            const dy = zones.character.y + Math.round((zones.character.h - fit.height) / 2);
            canvas.composite(fit, dx, dy);
            characterAssetId = pick.id;
            await supabase.from('no_lube_assets').update({
              times_used: (pick.times_used ?? 0) + 1,
              last_used_at: new Date().toISOString(),
            }).eq('id', pick.id);
          } catch (e) { console.warn('[compose-card] character decode failed', e); }
        }
      }
    }

    // 5. Fixed text overlays — STRICT, never AI'd.
    if (zones.ticker) drawTextInZone(canvas, font, `$${ticker}`, zones.ticker, 0x22d3ceff, 72);
    if (zones.ca && tpl.show_ca !== false) drawTextInZone(canvas, font, caShort(mint), zones.ca, 0xcbd5e1ff, 28);
    if (zones.multiplier) {
      const mTxt = `${Number(multiplier) >= 10 ? Math.round(Number(multiplier)) : Number(multiplier).toFixed(1)}X`;
      drawTextInZone(canvas, font, mTxt, zones.multiplier, 0xfacc15ff, 110);
    }
    if (zones.entry_label) drawTextInZone(canvas, font, 'ENTRY', zones.entry_label, 0x94a3b8ff, 26);
    if (zones.entry_value) drawTextInZone(canvas, font, fmtK(Number(entry_mcap)), zones.entry_value, 0xffffffff, 56);
    if (zones.current_label) drawTextInZone(canvas, font, 'NOW', zones.current_label, 0x94a3b8ff, 26);
    if (zones.current_value) drawTextInZone(canvas, font, fmtK(Number(current_mcap)), zones.current_value, 0x4ade80ff, 56);
    if (zones.show_url && tpl.show_url !== false) {
      const urlText = (tpl.url_to_show || channel_brand || 't.me/blackboxfarm').toString();
      drawTextInZone(canvas, font, urlText, zones.show_url, 0x94a3b8ff, 24);
    }

    // 6. Encode JPEG and rebrand EXIF.
    const jpegBytes = await canvas.encodeJPEG(92);
    const year = new Date().getFullYear();
    const exifDesc = tpl.exif_description || `${channel_brand} — $${ticker} hit ${multiplier}X`;
    const exifOwner = tpl.exif_owner || 'BlackBox Farm';
    const exifCopyright = tpl.exif_copyright || `Copyright (c) ${year} BlackBox Farm. All rights reserved.`;
    const { bytes: outBytes, mime: outMime } = rebrandImage(jpegBytes, 'image/jpeg', {
      fields: {
        imageDescription: exifDesc,
        software: 'BlackBox Farm No-Lube Compositor',
        artist: exifOwner,
        copyright: exifCopyright,
        xpTitle: `${channel_brand} — $${ticker} ${multiplier}X`,
        xpSubject: exifDesc,
        xpAuthor: exifOwner,
        xpKeywords: `BlackBox Farm;No Lube;${channel_brand};${ticker};Solana;Memecoin`,
        xpComment: `${exifCopyright} | https://blackbox.farm`,
      },
      copyrightLines: [exifCopyright, `Subject: ${exifDesc}`, 'Source: BlackBox Farm No-Lube Compositor'],
    });

    // 7. Upload.
    const filename = `${profile_kind}/${Date.now()}_${mint.slice(0, 8)}_${Math.round(Number(multiplier))}x.jpg`;
    const { error: upErr } = await supabase.storage.from('no-lube-rendered-cards').upload(filename, outBytes, {
      contentType: outMime || 'image/jpeg', upsert: false,
    });
    if (upErr) {
      return new Response(JSON.stringify({ ok: false, error: `upload: ${upErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: pub } = supabase.storage.from('no-lube-rendered-cards').getPublicUrl(filename);
    const publicUrl = pub.publicUrl;

    // 8. Archive.
    try {
      await supabase.from('no_lube_card_renders').insert({
        template_id: tpl.id,
        profile_kind,
        language: langSafe,
        token_mint: mint,
        ticker,
        multiplier,
        entry_mcap,
        current_mcap,
        asset_ids: characterAssetId ? [characterAssetId] : [],
        prompt: null,
        output_url: publicUrl,
        ai_used: false,
        fallback_reason: null,
        selection_reason: selectionReason,
        rotation_mode: rotationMode,
      });
    } catch (e) { console.warn('[compose-card] archive insert failed', e); }

    return new Response(JSON.stringify({
      ok: true,
      image_url: publicUrl,
      template_id: tpl.id,
      template_name: tpl.template_name,
      character_asset_id: characterAssetId,
      selection_reason: selectionReason,
      rotation_mode: rotationMode,
      ai_used: false,
      // Surface the real source assets used so the orchestrator (and any
      // future visual overlay step) can prove the imagery is authentic.
      token_image_url: token_image_url || null,
      banner_url: banner_url || null,
      has_paid_dex: !!has_paid_dex,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-compose-card] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});