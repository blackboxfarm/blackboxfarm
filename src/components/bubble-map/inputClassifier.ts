/**
 * Classify a raw bubblemap input string into one of the supported
 * mesh entity types so the view can choose the right centerpiece.
 *
 *   handle      → @something or x.com/something  (NOT communities/...)
 *   community   → x.com/i/communities/<digits>  or bare numeric community id
 *   wallet      → 32-44 char base58 Solana address
 *   token       → also 32-44 char base58 — same shape as wallet, classified
 *                 as 'token' by default and swapped to 'wallet' downstream
 *                 if the address is not found in tokens / token_metadata.
 *   unknown     → fallback
 *
 * Shared between PublicBubbleMap.handleSearch (auto-route) and any future
 * /mesh page or telegram-bot handler.
 */

export type MeshInputKind = 'handle' | 'community' | 'token' | 'wallet' | 'unknown';

export interface ClassifiedInput {
  kind: MeshInputKind;
  value: string;        // canonical id (handle without @, numeric community id, address)
  raw: string;          // original input
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HANDLE_RE = /^[a-zA-Z0-9_]{1,15}$/;
const COMMUNITY_URL_RE = /(?:twitter\.com|x\.com)\/i\/communities\/(\d{6,25})/i;
const HANDLE_URL_RE = /(?:twitter\.com|x\.com)\/(?!i\/)@?([a-zA-Z0-9_]{1,15})\b/i;

export function classifyMeshInput(raw: string): ClassifiedInput {
  const r = (raw || '').trim();
  if (!r) return { kind: 'unknown', value: '', raw };

  // X Community URL
  const cm = r.match(COMMUNITY_URL_RE);
  if (cm) return { kind: 'community', value: cm[1], raw };

  // X Handle URL
  const hm = r.match(HANDLE_URL_RE);
  if (hm) return { kind: 'handle', value: hm[1].toLowerCase(), raw };

  // Bare @handle
  if (r.startsWith('@')) {
    const cleaned = r.slice(1);
    if (HANDLE_RE.test(cleaned)) return { kind: 'handle', value: cleaned.toLowerCase(), raw };
  }

  // Bare numeric community id (>= 6 digits — community ids are long)
  if (/^\d{6,25}$/.test(r)) return { kind: 'community', value: r, raw };

  // Solana address shape — token by default
  if (BASE58_RE.test(r)) return { kind: 'token', value: r, raw };

  // Bare handle (no @, no URL)
  if (HANDLE_RE.test(r) && r.length >= 3) return { kind: 'handle', value: r.toLowerCase(), raw };

  return { kind: 'unknown', value: r, raw };
}