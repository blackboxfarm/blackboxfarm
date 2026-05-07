/**
 * Build a Supabase Storage image-transformation URL.
 * Converts /storage/v1/object/public/... into /storage/v1/render/image/public/...
 * with width/height/quality params for thumbnails / reduced-size hero images.
 *
 * Falls back to the original URL if it doesn't look like a Supabase public storage URL.
 */
export function supabaseThumb(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
): string {
  if (!url) return '';
  const { width, height, quality = 70, resize = 'cover' } = opts;
  try {
    const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    if (transformed === url) return url; // not a supabase public storage URL
    const u = new URL(transformed);
    if (width) u.searchParams.set('width', String(width));
    if (height) u.searchParams.set('height', String(height));
    u.searchParams.set('resize', resize);
    u.searchParams.set('quality', String(quality));
    return u.toString();
  } catch {
    return url;
  }
}
