/**
 * Strip EXIF data from an image blob by re-encoding through canvas,
 * and generate a short human-readable filename.
 */

const ADJECTIVES = [
  'bold', 'sharp', 'dark', 'vivid', 'clean', 'prime', 'raw', 'core',
  'deep', 'swift', 'bright', 'solid', 'keen', 'fresh', 'stark',
];

const NOUNS = [
  'signal', 'pulse', 'frame', 'lens', 'view', 'shot', 'flash', 'grid',
  'drop', 'spark', 'edge', 'bloom', 'trace', 'mark', 'glow',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a short, human-style image name like "bold-signal-hero" */
export function generateImageName(context: 'hero' | 'inline', articleTitle?: string): string {
  const slug = articleTitle
    ? articleTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24)
        .replace(/-$/, '')
    : '';

  const flair = `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
  const suffix = context === 'hero' ? 'hero' : 'inline';

  return slug
    ? `${slug}-${flair}-${suffix}`
    : `${flair}-${suffix}`;
}

/**
 * Re-encode an image blob through a canvas to strip all EXIF/metadata,
 * then inject minimal IPTC-style copyright info via a comment marker.
 * 
 * Since canvas.toBlob strips all metadata by default, this effectively
 * removes EXIF, GPS, camera info, and original creator data.
 * 
 * Returns a clean JPEG blob.
 */
export async function stripExifAndBrand(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob); // fallback
        return;
      }
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (cleanBlob) => {
          if (!cleanBlob) {
            resolve(blob);
            return;
          }

          // Inject a minimal XMP/comment with our copyright into the JPEG
          injectCopyright(cleanBlob).then(resolve).catch(() => resolve(cleanBlob));
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Inject a JPEG COM (comment) marker with copyright info.
 * This is the simplest way to embed ownership without external libs.
 */
async function injectCopyright(blob: Blob): Promise<Blob> {
  const copyright = [
    `Copyright (c) ${new Date().getFullYear()} BlackBox Farm`,
    `Website: https://blackbox.farm`,
    `Source: BlackBox Farm Intelligence Platform`,
    `All rights reserved.`,
  ].join('\n');

  const buf = await blob.arrayBuffer();
  const src = new Uint8Array(buf);

  // JPEG starts with FF D8. Insert COM marker (FF FE) right after SOI.
  if (src[0] !== 0xFF || src[1] !== 0xD8) {
    return blob; // not a JPEG
  }

  const commentBytes = new TextEncoder().encode(copyright);
  const len = commentBytes.length + 2; // +2 for length field itself

  // Build COM marker: FF FE + 2-byte length + comment
  const comMarker = new Uint8Array(4 + commentBytes.length);
  comMarker[0] = 0xFF;
  comMarker[1] = 0xFE;
  comMarker[2] = (len >> 8) & 0xFF;
  comMarker[3] = len & 0xFF;
  comMarker.set(commentBytes, 4);

  // Splice: SOI (2 bytes) + COM marker + rest of JPEG
  const result = new Uint8Array(2 + comMarker.length + (src.length - 2));
  result.set(src.subarray(0, 2), 0);
  result.set(comMarker, 2);
  result.set(src.subarray(2), 2 + comMarker.length);

  return new Blob([result], { type: 'image/jpeg' });
}
