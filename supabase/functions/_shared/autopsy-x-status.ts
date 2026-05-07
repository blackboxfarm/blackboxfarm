/**
 * Lightweight check for X (twitter) account status.
 * Returns: 'active' | 'suspended' | 'not_found' | 'private' | 'unchecked'
 *
 * We use a server-side fetch of nitter mirrors first (no JS required), with
 * x.com itself as fallback. x.com returns 200 + JS-shell HTML for everything
 * including suspended accounts, so we look for marker strings, not status codes.
 */

const NITTER_MIRRORS = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
];

export type XAccountStatus = 'active' | 'suspended' | 'not_found' | 'private' | 'unchecked';

export async function checkXAccountStatus(handle: string): Promise<{
  status: XAccountStatus;
  source: string;
  evidence: string | null;
}> {
  const clean = handle.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30);
  if (!clean) return { status: 'unchecked', source: 'invalid_handle', evidence: null };

  // Try nitter mirrors (cleaner HTML, easier to parse).
  for (const base of NITTER_MIRRORS) {
    try {
      const r = await fetch(`${base}/${clean}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      });
      if (r.status === 404) return { status: 'not_found', source: base, evidence: '404' };
      if (!r.ok) continue;
      const html = (await r.text()).toLowerCase();
      if (html.includes('account has been suspended') || html.includes('user has been suspended')) {
        return { status: 'suspended', source: base, evidence: 'suspension marker' };
      }
      if (html.includes("user not found") || html.includes("doesn't exist")) {
        return { status: 'not_found', source: base, evidence: 'not-found marker' };
      }
      if (html.includes('this account is protected') || html.includes('tweets are protected')) {
        return { status: 'private', source: base, evidence: 'protected marker' };
      }
      // If we got the profile shell with @handle, treat as active.
      if (html.includes(`@${clean.toLowerCase()}`)) {
        return { status: 'active', source: base, evidence: 'profile shell' };
      }
    } catch { /* try next mirror */ }
  }

  // Fallback: x.com syndication endpoint (used by embeds — no JS needed).
  try {
    const r = await fetch(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${clean}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      if (Array.isArray(data) && data.length > 0) {
        return { status: 'active', source: 'twimg.syndication', evidence: 'followbutton info' };
      }
      // Empty array typically means suspended/not found.
      return { status: 'not_found', source: 'twimg.syndication', evidence: 'empty followbutton' };
    }
  } catch { /* ignore */ }

  return { status: 'unchecked', source: 'all_mirrors_failed', evidence: null };
}

export function extractXHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:twitter\.com|x\.com)\/(?!i\/communities|search|home|hashtag)([A-Za-z0-9_]{1,30})/i);
  return m?.[1] ?? null;
}