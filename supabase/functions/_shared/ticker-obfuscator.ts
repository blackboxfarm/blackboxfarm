/**
 * Telegram Ticker Obfuscator — Thin Formatting Protocol
 *
 * Prevents external Telegram bots from matching $TICKER cashtags in our messages
 * and triggering infinite reply chains. Two defences combined:
 *   1. Strip the leading `$` (cashtag prefix) — the trigger most bots look for.
 *   2. Interleave a zero-width space (U+200B) between every letter so that even
 *      bots that match plain symbols (TICKER) cannot string-compare them.
 *
 * Examples:
 *   obfuscateTicker('PEPE')   -> 'P\u200BE\u200BP\u200BE'
 *   obfuscateTicker('$PEPE')  -> 'P\u200BE\u200BP\u200BE'
 *   obfuscateTicker('AI')     -> 'A\u200BI'
 *   obfuscateTicker('X')      -> 'X'         (single char — nothing to interleave)
 *   obfuscateTicker('')       -> 'TOKEN'     (safe fallback)
 *
 * IMPORTANT: Only use for HUMAN-FACING text broadcast on Telegram.
 *   - Do NOT obfuscate raw symbols stored in DB or sent to APIs.
 *   - Do NOT obfuscate symbols in URLs, file paths, or code identifiers.
 */

const ZWSP = '\u200B';

export function obfuscateTicker(symbol: string | null | undefined): string {
  if (!symbol) return 'TOKEN';
  // Strip leading $ (cashtag) and surrounding whitespace
  const clean = String(symbol).replace(/^\$+/, '').trim();
  if (!clean) return 'TOKEN';
  if (clean.length <= 1) return clean;
  // Interleave zero-width space between every character
  return clean.split('').join(ZWSP);
}

/**
 * Convenience: produce the complete display label for Telegram messages.
 * Returns the obfuscated ticker WITHOUT the $ prefix (per thin-formatting protocol).
 *
 *   tgTickerLabel('PEPE')  -> 'P\u200BE\u200BP\u200BE'
 *   tgTickerLabel(null)    -> 'TOKEN'
 */
export function tgTickerLabel(symbol: string | null | undefined): string {
  return obfuscateTicker(symbol);
}
