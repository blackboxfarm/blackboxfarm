/**
 * Centralized X/Twitter handle & community extraction.
 * 
 * Prevents the "i" bug: x.com/i/communities/... was incorrectly
 * parsed as handle "i" because the regex matched the path segment.
 * 
 * All edge functions MUST use these helpers instead of local regex.
 */

// X path segments that are NOT user handles
const X_RESERVED_PATHS = new Set([
  'i', 'intent', 'search', 'hashtag', 'settings', 'home', 'explore',
  'notifications', 'messages', 'compose', 'lists', 'bookmarks',
  'communities', 'spaces', 'tos', 'privacy', 'help', 'about',
  'login', 'signup', 'share', 'status', 'jobs', 'download',
]);

/**
 * Extract an X/Twitter handle from a URL.
 * Returns null for community URLs (x.com/i/communities/...) and reserved paths.
 */
export function extractXHandle(url: string | null | undefined): string | null {
  if (!url) return null;

  // Community URLs are NOT handles — skip entirely
  if (url.includes('/communities/')) return null;

  const match = url.match(/(?:twitter\.com|x\.com)\/(@?([a-zA-Z0-9_]+))/i);
  if (!match) return null;

  const handle = (match[2] || match[1]).replace(/^@/, '').toLowerCase();

  // Reject reserved X path segments
  if (X_RESERVED_PATHS.has(handle)) return null;

  // Handles must be 1-15 chars
  if (handle.length === 0 || handle.length > 15) return null;

  return handle;
}

/**
 * Extract an X Community ID from a URL like x.com/i/communities/123456
 * Returns the numeric community ID string.
 */
export function extractXCommunityId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:twitter\.com|x\.com)\/i\/communities\/(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Classify an X/Twitter URL as 'handle', 'community', or null.
 */
export function classifyXUrl(url: string | null | undefined): 
  { type: 'handle'; value: string } | 
  { type: 'community'; value: string } | 
  null {
  if (!url) return null;

  const communityId = extractXCommunityId(url);
  if (communityId) return { type: 'community', value: communityId };

  const handle = extractXHandle(url);
  if (handle) return { type: 'handle', value: handle };

  return null;
}
