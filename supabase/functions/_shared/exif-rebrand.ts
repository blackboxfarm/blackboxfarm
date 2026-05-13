/**
 * Shared EXIF/metadata rebrander.
 *
 * Strips existing EXIF/XMP/IPTC/COM (JPEG) and tEXt/iTXt/zTXt/eXIf (PNG)
 * metadata, then injects BlackBox Farm copyright + caller-supplied fields.
 * Same byte-level technique used by intel-exif-rebrand for briefing images.
 */

export interface ExifFields {
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

export interface RebrandOptions {
  fields: ExifFields;
  /** Lines written into the JPEG COM segment / PNG Comment chunk. */
  copyrightLines: string[];
}

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
  const segLen = 6 + tiffSize + 2;
  const out = new Uint8Array(2 + segLen);
  out[0] = 0xff; out[1] = 0xe1;
  out[2] = (segLen >> 8) & 0xff; out[3] = segLen & 0xff;
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  const tiff = 10;
  out[tiff] = 0x49; out[tiff + 1] = 0x49;
  out[tiff + 2] = 0x2a; out[tiff + 3] = 0x00;
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

function rebrandJpeg(src: Uint8Array, fields: ExifFields, copyrightLines: string[]): Uint8Array {
  if (src[0] !== 0xff || src[1] !== 0xd8) return src;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < src.length) {
    if (src[i] !== 0xff) { out.push(src[i++]); continue; }
    const marker = src[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker); i += 2; continue;
    }
    if (marker === 0xda) {
      for (let j = i; j < src.length; j++) out.push(src[j]);
      break;
    }
    const segLen = (src[i + 2] << 8) | src[i + 3];
    const strip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!strip) {
      for (let j = i; j < i + 2 + segLen; j++) out.push(src[j]);
    }
    i += 2 + segLen;
  }
  const app1 = buildExifApp1(fields);
  const text = copyrightLines.join("\n");
  const tb = new TextEncoder().encode(text);
  const len = tb.length + 2;
  const com = [0xff, 0xfe, (len >> 8) & 0xff, len & 0xff, ...tb];
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

function rebrandPng(src: Uint8Array, fields: ExifFields, copyrightLines: string[]): Uint8Array {
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
    if (!injected && type === "IHDR") {
      const entries: Array<[string, string]> = [
        ["Title", fields.xpTitle || "BlackBox Farm Intelligence"],
        ["Author", fields.artist || "BlackBox Farm"],
        ["Copyright", fields.copyright || `Copyright (c) ${new Date().getFullYear()} BlackBox Farm. All rights reserved.`],
        ["Source", "https://blackbox.farm"],
        ["Software", fields.software || "BlackBox Farm Intelligence Platform"],
        ["Comment", copyrightLines.join(" | ")],
      ];
      if (fields.xpKeywords) entries.push(["Keywords", fields.xpKeywords]);
      if (fields.xpSubject) entries.push(["Description", fields.xpSubject]);
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

/**
 * Strip metadata + inject branded EXIF/text fields. Returns rebranded bytes
 * and resolved MIME. Falls back to original bytes for unsupported formats.
 */
export function rebrandImage(
  bytes: Uint8Array,
  mime: string,
  opts: RebrandOptions,
): { bytes: Uint8Array; mime: string } {
  const isJpg = mime.includes("jpeg") || mime.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8);
  const isPng = mime.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50);
  if (isJpg) return { bytes: rebrandJpeg(bytes, opts.fields, opts.copyrightLines), mime: "image/jpeg" };
  if (isPng) return { bytes: rebrandPng(bytes, opts.fields, opts.copyrightLines), mime: "image/png" };
  return { bytes, mime: mime || "application/octet-stream" };
}