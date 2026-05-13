/**
 * Twitter/X Template Sanitizer
 *
 * Removes invisible / zero-width characters that break hashtags,
 * cashtags, and @mentions on Twitter/X.
 *
 * Telegram's Thin Formatting Protocol interleaves U+200B between ticker
 * letters to stop bot cascades. When the same text (or a template that
 * was edited with those characters) is pasted into Twitter, the hidden
 * chars fragment the tag so it no longer turns blue / clickable.
 *
 * This function strips all problematic whitespace while preserving
 * normal spaces, tabs, and newlines.
 */

// Characters that fragment Twitter hashtags, cashtags, and handles
const TWITTER_BREAKING_CHARS = new RegExp(
  '[' +
    '\u200B' + // zero-width space
    '\u200C' + // zero-width non-joiner
    '\u200D' + // zero-width joiner
    '\u200E' + // left-to-right mark
    '\u200F' + // right-to-left mark
    '\u202A-\u202E' + // bidirectional formatting chars
    '\u2066-\u2069' + // directional isolates
    '\u00AD' + // soft hyphen
    '\u00A0' + // non-breaking space (often breaks tag parsing)
    '\u2007' + // figure space
    '\u202F' + // narrow no-break space
    '\uFEFF' + // zero-width no-break space (BOM)
  ']',
  'g'
);

/**
 * Strip invisible characters that break Twitter hashtags / mentions.
 * Preserves normal ASCII/Unicode whitespace (space, tab, newline, etc.)
 * so the text remains readable.
 */
export function sanitizeForTwitter(text: string): string {
  if (!text) return text;
  return text.replace(TWITTER_BREAKING_CHARS, '');
}

/**
 * Ensure a cashtag / hashtag / handle has no hidden chars.
 * Also strips the leading `$` if present so callers can add it back
 * consistently as `$TICKER` or `#TICKER`.
 */
export function sanitizeTickerForTwitter(symbol: string | null | undefined): string {
  if (!symbol) return 'TOKEN';
  const clean = String(symbol)
    .replace(/^\$+/, '')
    .replace(TWITTER_BREAKING_CHARS, '')
    .trim()
    .toUpperCase();
  return clean || 'TOKEN';
}

/**
 * Strip hidden chars from a Twitter handle (e.g. @blackbox_farm).
 * Ensures the @ stays at the front and the handle is clean.
 */
export function sanitizeHandleForTwitter(handle: string | null | undefined): string {
  if (!handle) return '';
  const clean = String(handle)
    .replace(/^@/, '')
    .replace(TWITTER_BREAKING_CHARS, '')
    .trim();
  return clean ? `@${clean}` : '';
}
