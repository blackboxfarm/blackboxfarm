/**
 * Shared vulture pre-filter + AI prompt builder for autopsy-vulture-sweep.
 *
 * Vulture types currently understood:
 *   - fake_live_pumpfun  : posts claiming the dev is going live on pump.fun
 *                          while linking to a non-pump.fun lookalike domain
 *                          (e.g. pumpem.fun) that phishes wallet credentials.
 *   - lookalike_domain   : any post linking to a known pump.fun lookalike
 *                          domain or a unicode-confusable of pump.fun.
 *   - wallet_drainer_link: post links to a known drainer host (catchall).
 *   - bot_copypasta      : same exact text posted by 3+ different handles.
 *   - benign / mod / dev : not a vulture.
 *
 * This file only exports pure functions — no DB, no fetch.
 */

export interface RawPost {
  handle: string;
  display_name?: string | null;
  text: string;
  urls: string[];
  posted_at?: string | null;
  post_url?: string | null;
  raw?: any;
}

export interface PreflagResult {
  flagged: boolean;
  reasons: string[];
  matched_kind: string | null;
  scam_urls: string[];
}

/** Strip protocol + path, lowercase host, drop leading www. */
export function hostnameOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Detect unicode-confusable spoofs of "pump.fun".
 * We NFKC-normalize the hostname and compare letter-by-letter against
 * "pumpfun" allowing any cyrillic/greek lookalikes to map back to ASCII.
 */
const CONFUSABLE_MAP: Record<string, string> = {
  'р': 'p', 'ρ': 'p', // cyrillic er, greek rho
  'ս': 'u', 'υ': 'u', 'ц': 'u',
  'ｍ': 'm', 'м': 'm',
  'ƒ': 'f', 'ф': 'f',
  'ս': 'u',
  'ո': 'n', 'η': 'n', 'п': 'n',
};

export function isPumpFunConfusable(host: string): boolean {
  if (!host) return false;
  if (host === 'pump.fun' || host.endsWith('.pump.fun')) return false; // real
  const normalized = host
    .normalize('NFKC')
    .split('')
    .map((ch) => CONFUSABLE_MAP[ch] ?? ch)
    .join('')
    .toLowerCase();
  // Looks like pump+fun but isn't actually pump.fun
  return /pump.{0,3}fun/.test(normalized);
}

const FAKE_LIVE_RX = /\b(dev (is )?live|going live|live now|livestream|live stream|live chat|tune in)\b/i;
const CA_RX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/; // base58 mint heuristic

export function preflagPost(post: RawPost, lookalikeDomains: Set<string>): PreflagResult {
  const reasons: string[] = [];
  const scam_urls: string[] = [];
  let matched_kind: string | null = null;

  for (const u of post.urls) {
    const host = hostnameOf(u);
    if (!host) continue;
    if (lookalikeDomains.has(host)) {
      reasons.push(`lookalike_domain:${host}`);
      scam_urls.push(u);
      matched_kind = matched_kind ?? 'lookalike_domain';
    } else if (isPumpFunConfusable(host)) {
      reasons.push(`confusable_pumpfun:${host}`);
      scam_urls.push(u);
      matched_kind = matched_kind ?? 'lookalike_domain';
    }
  }

  const text = post.text ?? '';
  if (FAKE_LIVE_RX.test(text)) {
    const hasNonPumpfunLink = post.urls.some((u) => {
      const h = hostnameOf(u);
      return h && h !== 'pump.fun' && !h.endsWith('.pump.fun') && !h.endsWith('.x.com') && !h.endsWith('twitter.com');
    });
    const hasCa = CA_RX.test(text);
    if (hasNonPumpfunLink || hasCa) {
      reasons.push('fake_live_pattern');
      matched_kind = matched_kind ?? 'fake_live_pumpfun';
    }
  }

  return {
    flagged: reasons.length > 0,
    reasons,
    matched_kind,
    scam_urls,
  };
}

/**
 * Group posts by exact normalized text and return groups whose size >= minDuplicates.
 * Used to detect bot copypasta (same script across many handles).
 */
export function findCopypastaGroups(posts: RawPost[], minDuplicates = 3): Array<{ text: string; handles: string[] }> {
  const buckets = new Map<string, Set<string>>();
  for (const p of posts) {
    const key = (p.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (key.length < 20) continue;
    if (!buckets.has(key)) buckets.set(key, new Set());
    buckets.get(key)!.add(p.handle);
  }
  const out: Array<{ text: string; handles: string[] }> = [];
  for (const [text, handles] of buckets.entries()) {
    if (handles.size >= minDuplicates) out.push({ text, handles: [...handles] });
  }
  return out;
}

/** Build the system + user prompt for the AI classifier. */
export function buildClassifierPrompt(
  posts: RawPost[],
  preflags: PreflagResult[],
  lookalikeDomains: string[],
  copypastaGroups: Array<{ text: string; handles: string[] }>,
): { system: string; user: string } {
  const system = `You are a forensic crypto-scam classifier. You read posts from a dead Solana token's X (Twitter) Community feed and decide whether each post is a "vulture" — an account preying on remaining holders to phish their pump.fun / Phantom / MetaMask wallet credentials.

Vulture kinds you may assign:
- "fake_live_pumpfun"  : claims dev is going live on pump.fun, links to a fake/lookalike domain.
- "lookalike_domain"   : any link to a pump.fun lookalike (pumpem.fun, pump-fun.app, unicode-confusable of pump.fun, etc.).
- "wallet_drainer_link": link to a generic wallet-drainer / signing scam.
- "bot_copypasta"      : identical scripted text being repeated by many accounts.
- "benign"             : not a scam (genuine community chatter, memes, complaints).
- "mod"                : moderator/admin behavior (deleting, pinning, addressing reports).
- "dev"                : the actual project dev/team posting.

Known lookalike phishing domains (any URL using these is automatically a phishing post): ${lookalikeDomains.join(', ')}.

Output STRICT JSON only — no prose, no markdown, no code fences. Schema:
{ "posts": [ { "index": <int>, "handle": "...", "vulture_kind": "...", "confidence": 0-100, "reason": "...", "scam_urls": ["..."] } ] }

You MUST return one entry per input post in the same order. Use confidence 80-100 for clear scams, 50-79 for likely, 0-49 for unsure or benign.`;

  const lines: string[] = [];
  posts.forEach((p, i) => {
    const pre = preflags[i];
    lines.push(
      `#${i} @${p.handle} ${p.posted_at ?? ''}${pre.flagged ? ` [PRE-FLAGGED: ${pre.reasons.join('; ')}]` : ''}`,
      `text: ${(p.text ?? '').slice(0, 500).replace(/\s+/g, ' ')}`,
      `urls: ${p.urls.join(' | ') || '(none)'}`,
      '',
    );
  });

  const copypastaNote = copypastaGroups.length > 0
    ? `\nDetected copypasta groups (same exact text from multiple handles — strong bot signal):\n${copypastaGroups.slice(0, 5).map(g => `- ${g.handles.length} handles posting: "${g.text.slice(0, 120)}..."`).join('\n')}`
    : '';

  const user = `Classify each post below.${copypastaNote}\n\nPOSTS:\n${lines.join('\n')}`;
  return { system, user };
}
