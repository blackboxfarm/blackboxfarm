// Client-side rasterisation helpers for the /brand asset library.
// Turns the inline SVG marks into PNG downloads (opaque or transparent)
// and composes social banners on a canvas.

import { BRAND_COLORS as C } from "@/lib/brand";

export function triggerDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`;
}

function loadSvgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const source = serializeSvg(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterise the mark"));
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
}

export type BannerStyle = "void" | "grid" | "gold";

/** Paint one of the three brand backgrounds onto a context. */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: BannerStyle,
) {
  if (style === "gold") {
    const g = ctx.createLinearGradient(0, h, w, 0);
    g.addColorStop(0, C.gold);
    g.addColorStop(1, "#7A5A02");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, C.void);
  g.addColorStop(1, style === "grid" ? "#0A2630" : C.carbon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (style === "grid") {
    const step = Math.max(24, Math.round(Math.min(w, h) / 18));
    ctx.save();
    ctx.strokeStyle = C.cyan;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Rasterise a mark to a square PNG.
 * `background: null` keeps it transparent, a BannerStyle paints the brand
 * background, any other string is used as a flat fill.
 */
export async function markToPng(
  svg: SVGSVGElement,
  size: number,
  background: BannerStyle | string | null,
): Promise<Blob> {
  const img = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (background === "void" || background === "grid" || background === "gold") {
    paintBackground(ctx, size, size, background);
  } else if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  const pad = Math.round(size * 0.08);
  ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
  return toBlob(canvas);
}

export type BannerPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  note: string;
};

export const BANNER_PRESETS: BannerPreset[] = [
  { id: "og", label: "Social / OG card", width: 1200, height: 630, note: "Link previews, Facebook, LinkedIn" },
  { id: "x", label: "X / Twitter header", width: 1500, height: 500, note: "@HoldersIntel profile cover" },
  { id: "square", label: "Square post", width: 1080, height: 1080, note: "Instagram, TG channel art" },
  { id: "email", label: "Telegram / email banner", width: 1200, height: 300, note: "Broadcast + newsletter headers" },
];

const DISPLAY = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Compose a banner: mark + wordmark + tagline on one of three backgrounds. */
export async function bannerToPng(
  svg: SVGSVGElement,
  preset: BannerPreset,
  style: BannerStyle,
  tagline: string,
): Promise<Blob> {
  const img = await loadSvgImage(svg);
  const { width: w, height: h } = preset;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  paintBackground(ctx, w, h, style);

  const onGold = style === "gold";
  const wordColor = onGold ? C.void : C.mist;
  const accentColor = onGold ? "#0B2E33" : C.cyan;
  const stacked = preset.id === "square";

  const short = Math.min(w, h);
  const markSize = stacked ? short * 0.32 : short * 0.48;
  const titleSize = stacked ? short * 0.1 : short * 0.17;
  const tagSize = titleSize * 0.3;
  const display = `700 ${titleSize}px ${DISPLAY}`;

  ctx.textBaseline = "middle";
  ctx.font = display;
  const partA = "Black";
  const partB = "Box";
  const partC = " Farm";
  const wA = ctx.measureText(partA).width;
  const wB = ctx.measureText(partB).width;
  const wC = ctx.measureText(partC).width;
  const textW = wA + wB + wC;

  const drawWord = (x: number, y: number) => {
    ctx.font = display;
    ctx.textAlign = "left";
    ctx.fillStyle = wordColor;
    ctx.fillText(partA, x, y);
    ctx.fillStyle = accentColor;
    ctx.fillText(partB, x + wA, y);
    ctx.fillStyle = wordColor;
    ctx.fillText(partC, x + wA + wB, y);
  };

  const drawTag = (x: number, y: number, center: boolean) => {
    if (!tagline) return;
    ctx.font = `500 ${tagSize}px ${MONO}`;
    ctx.textAlign = center ? "center" : "left";
    ctx.fillStyle = onGold ? C.void : C.mist;
    ctx.globalAlpha = 0.82;
    ctx.fillText(tagline, x, y);
    ctx.globalAlpha = 1;
  };

  if (stacked) {
    const cx = w / 2;
    ctx.drawImage(img, cx - markSize / 2, h * 0.26 - markSize / 2, markSize, markSize);
    drawWord(cx - textW / 2, h * 0.58);
    drawTag(cx, h * 0.58 + titleSize * 0.95, true);
  } else {
    const gap = short * 0.09;
    const blockW = markSize + gap + textW;
    const startX = (w - blockW) / 2;
    ctx.drawImage(img, startX, h / 2 - markSize / 2, markSize, markSize);
    const textX = startX + markSize + gap;
    const baseline = tagline ? h / 2 - tagSize * 0.75 : h / 2;
    drawWord(textX, baseline);
    drawTag(textX, baseline + titleSize * 0.8, false);
  }

  return toBlob(canvas);
}