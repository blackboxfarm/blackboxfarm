import { toPng } from 'html-to-image';

/**
 * Capture the visible Bubble Map area as a PNG Blob, with a branded
 * header/footer overlay applied. Supports both ForceGraph2D ("bubble" /
 * "tree") and React Flow ("schematic") views.
 */

export type CaptureView = 'bubble' | 'schematic';

export interface CaptureWatermark {
  ticker?: string;
  ca?: string;
  grade?: string;
  viewLabel?: string;
}

export interface CaptureOptions {
  view: CaptureView;
  /** For 'bubble': the ForceGraph2D ref (graphRef.current) */
  forceGraphRef?: any;
  /** For 'schematic': the wrapper div containing the .react-flow root */
  schematicContainer?: HTMLElement | null;
  watermark?: CaptureWatermark;
  /** Output canvas size (defaults to 1200x675 — Twitter/OG safe). */
  width?: number;
  height?: number;
}

const OUT_W_DEFAULT = 1200;
const OUT_H_DEFAULT = 675;

function truncateCa(ca?: string): string {
  if (!ca) return '';
  return ca.length > 12 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca;
}

function gradeColor(grade?: string): string {
  if (!grade) return '#9ca3af';
  if (grade.startsWith('A')) return '#10b981';
  if (grade.startsWith('B')) return '#3b82f6';
  if (grade.startsWith('C')) return '#f59e0b';
  return '#ef4444';
}

/** Draw the source canvas/image into a branded 1200x675 frame. */
function compose(source: HTMLCanvasElement | HTMLImageElement, w: CaptureWatermark = {}, outW = OUT_W_DEFAULT, outH = OUT_H_DEFAULT): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;

  // Black background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, outW, outH);

  // Header strip
  const headerH = 64;
  const footerH = 44;
  const padX = 24;

  // Compute "cover" fit for the source into the inner area
  const innerY = headerH;
  const innerH = outH - headerH - footerH;
  const innerW = outW - padX * 2;

  const srcW = (source as HTMLCanvasElement).width || (source as HTMLImageElement).naturalWidth;
  const srcH = (source as HTMLCanvasElement).height || (source as HTMLImageElement).naturalHeight;
  const ratio = Math.max(innerW / srcW, innerH / srcH);
  const drawW = srcW * ratio;
  const drawH = srcH * ratio;
  const drawX = padX + (innerW - drawW) / 2;
  const drawY = innerY + (innerH - drawH) / 2;

  // Clip the inner area so the cover-fit doesn't bleed into header/footer
  ctx.save();
  ctx.beginPath();
  ctx.rect(padX, innerY, innerW, innerH);
  ctx.clip();
  ctx.drawImage(source, drawX, drawY, drawW, drawH);
  ctx.restore();

  // Subtle gold border around the inner image
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);

  // ── HEADER ─────────────────────────────────────────────────
  // Left: ticker + CA
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  const ticker = w.ticker ? `$${w.ticker}` : 'BUBBLE MAP';
  ctx.fillText(ticker, padX, headerH / 2 - 6);

  if (w.ca) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`CA: ${truncateCa(w.ca)}`, padX, headerH / 2 + 14);
  }

  // Right: grade pill + view label
  if (w.grade) {
    const pillW = 70;
    const pillH = 30;
    const pillX = outW - padX - pillW;
    const pillY = headerH / 2 - pillH / 2;
    ctx.fillStyle = gradeColor(w.grade);
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(pillX, pillY, pillW, pillH, 6) : ctx.rect(pillX, pillY, pillW, pillH);
    ctx.fill();
    ctx.fillStyle = '#0a0a0f';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.grade, pillX + pillW / 2, pillY + pillH / 2);
    ctx.textAlign = 'left';
  }

  if (w.viewLabel) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const rightX = w.grade ? outW - padX - 80 : outW - padX;
    ctx.fillText(w.viewLabel, rightX, headerH / 2);
    ctx.textAlign = 'left';
  }

  // ── FOOTER ─────────────────────────────────────────────────
  ctx.fillStyle = '#eab308';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('blackbox.farm/holders', padX, outH - footerH / 2);

  ctx.fillStyle = '#6b7280';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Mapped on @HoldersIntel · ${new Date().toLocaleDateString()}`,
    outW - padX,
    outH - footerH / 2
  );
  ctx.textAlign = 'left';

  return out;
}

async function captureForceGraph(forceGraphRef: any, watermark: CaptureWatermark, w: number, h: number): Promise<Blob> {
  if (!forceGraphRef) throw new Error('ForceGraph ref is null');
  // react-force-graph-2d exposes the canvas via .canvas() accessor; fall back
  // to scanning the DOM if that isn't available.
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (typeof forceGraphRef.canvas === 'function') {
      canvas = forceGraphRef.canvas() as HTMLCanvasElement;
    }
  } catch { /* ignore */ }

  if (!canvas) {
    // Fallback — find the canvas element rendered by ForceGraph2D in the DOM
    canvas = document.querySelector('.force-graph-container canvas') as HTMLCanvasElement | null;
  }
  if (!canvas) throw new Error('Could not locate ForceGraph canvas element');

  // Pause animation if available so we capture a stable frame
  try { forceGraphRef.pauseAnimation?.(); } catch { /* ignore */ }
  // Force a redraw before capture
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const composed = compose(canvas, watermark, w, h);

  try { forceGraphRef.resumeAnimation?.(); } catch { /* ignore */ }

  return await new Promise<Blob>((resolve, reject) => {
    composed.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to encode PNG'));
      resolve(blob);
    }, 'image/png', 0.95);
  });
}

async function captureSchematic(container: HTMLElement, watermark: CaptureWatermark, w: number, h: number): Promise<Blob> {
  // Target the React Flow root (the inner viewport). Falls back to container.
  const rfRoot = container.querySelector('.react-flow') as HTMLElement | null;
  const target = rfRoot ?? container;

  const dataUrl = await toPng(target, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#0a0a0f',
    // Skip embedded webfonts — fetching them often trips html-to-image's
    // stylesheet parser ("can't access property trim of undefined") when a
    // cross-origin sheet or @font-face rule has an unexpected shape.
    skipFonts: true,
    // Skip the controls / minimap / attribution so the capture is graph-only
    filter: (node: HTMLElement) => {
      // Skip non-element nodes defensively (html-to-image only handles Elements)
      if (!(node instanceof Element)) return true;
      const cl = (node as HTMLElement).classList;
      if (!cl) return true;
      if (cl.contains('react-flow__controls')) return false;
      if (cl.contains('react-flow__minimap')) return false;
      if (cl.contains('react-flow__attribution')) return false;
      // Skip <link rel="stylesheet"> and <style> tags inside the subtree
      const tag = (node as HTMLElement).tagName;
      if (tag === 'LINK' || tag === 'STYLE') return false;
      return true;
    },
  });

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load captured schematic image'));
    img.src = dataUrl;
  });

  const composed = compose(img, watermark, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    composed.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to encode PNG'));
      resolve(blob);
    }, 'image/png', 0.95);
  });
}

export async function captureBubbleMap(opts: CaptureOptions): Promise<Blob> {
  const w = opts.width ?? OUT_W_DEFAULT;
  const h = opts.height ?? OUT_H_DEFAULT;
  const wm = opts.watermark ?? {};

  if (opts.view === 'bubble') {
    return await captureForceGraph(opts.forceGraphRef, wm, w, h);
  }
  if (opts.view === 'schematic') {
    if (!opts.schematicContainer) throw new Error('schematicContainer is required for schematic capture');
    return await captureSchematic(opts.schematicContainer, wm, w, h);
  }
  throw new Error(`Unsupported view: ${opts.view}`);
}

/** Convert a Blob → base64 (no data: prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}