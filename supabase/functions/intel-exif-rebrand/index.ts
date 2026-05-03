import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const COPYRIGHT_LINES = [
  `Copyright (c) ${new Date().getFullYear()} BlackBox Farm. All rights reserved.`,
  `Website: https://blackbox.farm`,
  `Telegram: https://t.me/HoldersIntel`,
  `X / Twitter: https://x.com/HoldersIntel`,
  `Slogan: Holders Don't Lie. We Just Read The Mesh.`,
  `Source: BlackBox Farm Intelligence Platform`,
];

interface ExifFields {
  imageDescription?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  xpTitle?: string;
  xpComment?: string;
  xpAuthor?: string;
  xpKeywords?: string;
  xpSubject?: string;
}

/** Build a real APP1/EXIF segment (TIFF/IFD0) so Windows Explorer Details tab populates. */
function buildExifApp1(fields: ExifFields): Uint8Array {
  const enc = new TextEncoder();
  type Entry = { tag: number; type: number; count: number; data: Uint8Array };
  const entries: Entry[] = [];
  const addAscii = (tag: number, val?: string) => {
    if (!val) return;
    const bytes = enc.encode(val + "\0");
    entries.push({ tag, type: 2, count: bytes.length, data: bytes });
  };
  const addXP = (tag: number, val?: string) => {
    if (!val) return;
    const out = new Uint8Array((val.length + 1) * 2);
    for (let i = 0; i < val.length; i++) {
      const c = val.charCodeAt(i);
      out[i * 2] = c & 0xff;
      out[i * 2 + 1] = (c >> 8) & 0xff;
    }
    entries.push({ tag, type: 1, count: out.length, data: out });
  };
  addAscii(0x010E, fields.imageDescription);
  addAscii(0x0131, fields.software);
  addAscii(0x013B, fields.artist);
  addAscii(0x8298, fields.copyright);
  addXP(0x9C9B, fields.xpTitle);
  addXP(0x9C9C, fields.xpComment);
  addXP(0x9C9D, fields.xpAuthor);
  addXP(0x9C9E, fields.xpKeywords);
  addXP(0x9C9F, fields.xpSubject);
  entries.sort((a, b) => a.tag - b.tag);

  const ifdSize = 2 + entries.length * 12 + 4;
  const sizeOf = (e: Entry) => e.count * ((e.type === 1 || e.type === 2) ? 1 : 4);
  const dataTotal = entries.reduce((acc, e) => {
    const bl = sizeOf(e);
    return acc + (bl > 4 ? bl + (bl % 2) : 0);
  }, 0);
  const tiffSize = 8 + ifdSize + dataTotal;
  const segLen = 6 + tiffSize + 2; // "Exif\0\0" + TIFF + 2-byte length itself
  const out = new Uint8Array(2 + segLen); // marker + segment
  out[0] = 0xff; out[1] = 0xe1;
  out[2] = (segLen >> 8) & 0xff; out[3] = segLen & 0xff;
  // "Exif\0\0"
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  const tiff = 10;
  out[tiff] = 0x49; out[tiff + 1] = 0x49;
  out[tiff + 2] = 0x2a; out[tiff + 3] = 0x00;
  // IFD0 offset = 8
  out[tiff + 4] = 8;
  const ifdStart = tiff + 8;
  out[ifdStart] = entries.length & 0xff;
  out[ifdStart + 1] = (entries.length >> 8) & 0xff;
  const dataAreaStart = ifdStart + 2 + entries.length * 12 + 4;
  let dataCursor = dataAreaStart;
  let dataOffsetRel = dataAreaStart - tiff;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const eo = ifdStart + 2 + i * 12;
    out[eo] = e.tag & 0xff; out[eo + 1] = (e.tag >> 8) & 0xff;
    out[eo + 2] = e.type & 0xff; out[eo + 3] = (e.type >> 8) & 0xff;
    out[eo + 4] = e.count & 0xff;
    out[eo + 5] = (e.count >> 8) & 0xff;
    out[eo + 6] = (e.count >> 16) & 0xff;
    out[eo + 7] = (e.count >> 24) & 0xff;
    const bl = sizeOf(e);
    if (bl <= 4) {
      for (let j = 0; j < bl; j++) out[eo + 8 + j] = e.data[j];
    } else {
      out[eo + 8] = dataOffsetRel & 0xff;
      out[eo + 9] = (dataOffsetRel >> 8) & 0xff;
      out[eo + 10] = (dataOffsetRel >> 16) & 0xff;
      out[eo + 11] = (dataOffsetRel >> 24) & 0xff;
      for (let j = 0; j < bl; j++) out[dataCursor + j] = e.data[j];
      const padded = bl + (bl % 2);
      dataCursor += padded;
      dataOffsetRel += padded;
    }
  }
  return out;
}

/** JPEG: strip APP1 (EXIF/XMP) + APP13 (IPTC) + existing COM, inject APP1/EXIF + COM. */
function rebrandJpeg(src: Uint8Array, fields: ExifFields): Uint8Array {
  if (src[0] !== 0xff || src[1] !== 0xd8) return src;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < src.length) {
    if (src[i] !== 0xff) { out.push(src[i++]); continue; }
    const marker = src[i + 1];
    // Standalone markers
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker); i += 2; continue;
    }
    if (marker === 0xda) { // SOS — image data, copy rest
      for (let j = i; j < src.length; j++) out.push(src[j]);
      break;
    }
    const segLen = (src[i + 2] << 8) | src[i + 3];
    // Strip APP1 (EXIF/XMP), APP13 (IPTC), COM
    const strip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!strip) {
      for (let j = i; j < i + 2 + segLen; j++) out.push(src[j]);
    }
    i += 2 + segLen;
  }
  // Build APP1/EXIF + COM marker
  const app1 = buildExifApp1(fields);
  const text = COPYRIGHT_LINES.join("\n");
  const tb = new TextEncoder().encode(text);
  const len = tb.length + 2;
  const com = [0xff, 0xfe, (len >> 8) & 0xff, len & 0xff, ...tb];
  // Insert APP1 + COM right after SOI
  const result = new Uint8Array(2 + app1.length + com.length + (out.length - 2));
  result.set([0xff, 0xd8], 0);
  result.set(app1, 2);
  result.set(com, 2 + app1.length);
  result.set(out.slice(2), 2 + app1.length + com.length);
  return result;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let CRC_TABLE: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildTextChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const kw = enc.encode(keyword);
  const txt = enc.encode(text);
  const data = new Uint8Array(kw.length + 1 + txt.length);
  data.set(kw, 0); data[kw.length] = 0; data.set(txt, kw.length + 1);
  const type = enc.encode("tEXt");
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const len = data.length;
  chunk[0] = (len >>> 24) & 0xff; chunk[1] = (len >>> 16) & 0xff;
  chunk[2] = (len >>> 8) & 0xff; chunk[3] = len & 0xff;
  chunk.set(type, 4); chunk.set(data, 8);
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0); crcInput.set(data, type.length);
  const crc = crc32(crcInput);
  const off = 8 + data.length;
  chunk[off] = (crc >>> 24) & 0xff; chunk[off+1] = (crc >>> 16) & 0xff;
  chunk[off+2] = (crc >>> 8) & 0xff; chunk[off+3] = crc & 0xff;
  return chunk;
}

/** PNG: strip existing tEXt/iTXt/zTXt/eXIf chunks, inject our textual metadata. */
function rebrandPng(src: Uint8Array): Uint8Array {
  for (let i = 0; i < 8; i++) if (src[i] !== PNG_SIG[i]) return src;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(src[i]);
  let pos = 8;
  let injected = false;
  while (pos + 8 <= src.length) {
    const len = (src[pos]<<24)|(src[pos+1]<<16)|(src[pos+2]<<8)|src[pos+3];
    const type = String.fromCharCode(src[pos+4],src[pos+5],src[pos+6],src[pos+7]);
    const total = 12 + len;
    const strip = type === "tEXt" || type === "iTXt" || type === "zTXt" || type === "eXIf";
    if (!strip) {
      for (let j = pos; j < pos + total && j < src.length; j++) out.push(src[j]);
    }
    // After IHDR, inject our chunks
    if (!injected && type === "IHDR") {
      const entries: Array<[string, string]> = [
        ["Title", "BlackBox Farm Intelligence"],
        ["Author", "BlackBox Farm"],
        ["Copyright", `Copyright (c) ${new Date().getFullYear()} BlackBox Farm. All rights reserved.`],
        ["Source", "https://blackbox.farm"],
        ["Software", "BlackBox Farm Intelligence Platform"],
        ["Comment", COPYRIGHT_LINES.join(" | ")],
      ];
      for (const [k, v] of entries) {
        const c = buildTextChunk(k, v);
        for (let j = 0; j < c.length; j++) out.push(c[j]);
      }
      injected = true;
    }
    pos += total;
  }
  return new Uint8Array(out);
}

function rebrand(bytes: Uint8Array, mime: string, fields: ExifFields): { bytes: Uint8Array; mime: string } {
  const isJpg = mime.includes("jpeg") || mime.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8);
  const isPng = mime.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50);
  if (isJpg) return { bytes: rebrandJpeg(bytes, fields), mime: "image/jpeg" };
  if (isPng) return { bytes: rebrandPng(bytes), mime: "image/png" };
  return { bytes, mime: mime || "application/octet-stream" };
}

function extractImageUrls(md: string): string[] {
  const urls = new Set<string>();
  const mdMatches = md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g);
  for (const m of mdMatches) urls.add(m[1]);
  const htmlMatches = md.matchAll(/<img[^>]+src=["']([^"']+)/gi);
  for (const m of htmlMatches) urls.add(m[1]);
  return [...urls];
}

function isOurStorageUrl(url: string, supabaseUrl: string): boolean {
  return url.startsWith(supabaseUrl) && url.includes("/storage/v1/object/public/");
}

function parseStoragePath(url: string, supabaseUrl: string): { bucket: string; path: string } | null {
  const prefix = `${supabaseUrl}/storage/v1/object/public/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length).split("?")[0];
  const idx = rest.indexOf("/");
  if (idx < 0) return null;
  return { bucket: rest.slice(0, idx), path: rest.slice(idx + 1) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { briefingId } = await req.json();
    if (!briefingId) {
      return new Response(JSON.stringify({ error: "briefingId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: b, error } = await supabase.from("intel_briefings")
      .select("id, title, slug, summary, content_md, featured_image_url").eq("id", briefingId).maybeSingle();
    if (error || !b) {
      return new Response(JSON.stringify({ error: error?.message || "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const targets = new Set<string>();
    if (b.featured_image_url) targets.add(b.featured_image_url);
    for (const u of extractImageUrls(b.content_md || "")) targets.add(u);

    const year = new Date().getFullYear();
    const fields: ExifFields = {
      imageDescription: (b.summary || b.title || "BlackBox Farm Intelligence").slice(0, 500),
      software: "BlackBox Farm Intelligence Platform",
      artist: "BlackBox Farm",
      copyright: `Copyright (c) ${year} BlackBox Farm. All rights reserved. https://blackbox.farm`,
      xpTitle: b.title || "BlackBox Farm Intelligence",
      xpSubject: b.summary || b.title || "BlackBox Farm Intelligence Briefing",
      xpAuthor: "BlackBox Farm",
      xpKeywords: "BlackBox Farm;HoldersIntel;Solana;Intelligence;Mesh;Crypto",
      xpComment: COPYRIGHT_LINES.join(" | "),
    };

    const results: Array<{ url: string; status: string; size?: number }> = [];
    for (const url of targets) {
      if (!isOurStorageUrl(url, SUPA_URL)) { results.push({ url, status: "skipped_external" }); continue; }
      const loc = parseStoragePath(url, SUPA_URL);
      if (!loc) { results.push({ url, status: "skipped_unparseable" }); continue; }
      try {
        const dl = await supabase.storage.from(loc.bucket).download(loc.path);
        if (dl.error || !dl.data) { results.push({ url, status: `download_failed:${dl.error?.message}` }); continue; }
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        const mime = dl.data.type || "image/jpeg";
        const { bytes, mime: outMime } = rebrand(buf, mime, fields);
        const up = await supabase.storage.from(loc.bucket).upload(loc.path, bytes, { contentType: outMime, upsert: true });
        if (up.error) { results.push({ url, status: `upload_failed:${up.error.message}` }); continue; }
        results.push({ url, status: "rebranded", size: bytes.length });
      } catch (e) {
        results.push({ url, status: `error:${(e as Error).message}` });
      }
    }

    await assertUpdate(
      supabase.from("intel_briefings").update({ exif_branded_at: new Date().toISOString() }).eq("id", briefingId),
      "intel_briefings",
    );

    const ok = results.filter(r => r.status === "rebranded").length;
    return new Response(JSON.stringify({ success: true, total: results.length, rebranded: ok, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});