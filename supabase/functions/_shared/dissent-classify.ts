/**
 * Shared dissent pre-filter + AI prompt builder for autopsy-community-sweep.
 *
 * Detects "Rioters' Dissent" in a dying token's X Community feed:
 *  - absent_dev          : "where's the dev?", "is the dev back?", "dev rugged"
 *  - no_marketing        : "no boosts", "no dex paid", "why no marketing"
 *  - no_creator_rewards  : "use creator rewards", "fund the comm with rewards"
 *  - no_communication    : "dev silent", "no updates", "ghosted us"
 *  - demanding_action    : "buy back", "burn supply", "do something"
 *  - capitulation        : "ngmi", "i'm out", "dead coin", "rip"
 *
 * Pure functions only — no DB, no fetch.
 */

import type { RawPost } from './vulture-classify.ts';

export type DissentSignal =
  | 'absent_dev'
  | 'no_marketing'
  | 'no_creator_rewards'
  | 'no_communication'
  | 'demanding_action'
  | 'capitulation'
  | 'benign';

export interface DissentPreflag {
  flagged: boolean;
  signals: DissentSignal[];
  reasons: string[];
}

const ABSENT_DEV_RX = /\b(where('?s| is) (the )?dev|wen dev|dev\?|is the dev (back|alive|awake|here|around)|any (word|news|update) from (the )?dev|dev (gone|ghost(ed)?|rugg?ed|missing|mia|awol)|dev silent|dev abandoned)\b/i;
const NO_MARKETING_RX = /\b(no (dex ?)?(boost|paid|trending|marketing|promo|ads?)|why (no|aren'?t) (we |they )?(boost|trend|market)|fund (the |a )?(boost|trend|dex paid|marketing)|need (more )?(boosts?|marketing|promo))\b/i;
const CREATOR_REWARDS_RX = /\b(creator rewards?|use (the )?rewards|reward (pool|funds)|claim (the )?rewards)\b/i;
const NO_COMM_RX = /\b(dev (is )?(silent|quiet|gone|missing|mia)|no updates?|haven'?t heard|crickets|radio silence|ghosted (us|the comm)|no comms?)\b/i;
const DEMANDING_RX = /\b(buy ?back|burn (the )?supply|do something|step up|where(\'?s| is) the plan|wen (update|news|plan|something)|fix (this|it))\b/i;
const CAPITULATION_RX = /\b(ngmi|i('?m)? out|i'?m done|dead (coin|project|token)|rip|cooked|over for|rugged|ded|its over)\b/i;

export function preflagDissent(post: RawPost): DissentPreflag {
  const text = post.text ?? '';
  const signals: DissentSignal[] = [];
  const reasons: string[] = [];

  if (ABSENT_DEV_RX.test(text)) { signals.push('absent_dev'); reasons.push('absent_dev_rx'); }
  if (NO_MARKETING_RX.test(text)) { signals.push('no_marketing'); reasons.push('no_marketing_rx'); }
  if (CREATOR_REWARDS_RX.test(text)) { signals.push('no_creator_rewards'); reasons.push('creator_rewards_rx'); }
  if (NO_COMM_RX.test(text)) { signals.push('no_communication'); reasons.push('no_comm_rx'); }
  if (DEMANDING_RX.test(text)) { signals.push('demanding_action'); reasons.push('demanding_rx'); }
  if (CAPITULATION_RX.test(text)) { signals.push('capitulation'); reasons.push('capitulation_rx'); }

  return { flagged: signals.length > 0, signals, reasons };
}

/** Compute dissent_score 0-100 from signal counts. */
export function computeDissentScore(counts: Record<DissentSignal, number>, postsScanned: number): number {
  if (postsScanned === 0) return 0;
  // Weight: absent_dev / no_communication are strongest (clear neglect signals)
  const weighted =
    (counts.absent_dev ?? 0) * 4 +
    (counts.no_communication ?? 0) * 4 +
    (counts.no_marketing ?? 0) * 3 +
    (counts.no_creator_rewards ?? 0) * 2 +
    (counts.demanding_action ?? 0) * 2 +
    (counts.capitulation ?? 0) * 2;
  // Normalize against post volume; saturate at 100.
  const density = weighted / Math.max(10, postsScanned);
  return Math.max(0, Math.min(100, Math.round(density * 100)));
}

export function buildDissentPrompt(
  posts: RawPost[],
  preflags: DissentPreflag[],
): { system: string; user: string } {
  const system = `You are a forensic crypto-community sentiment classifier. You read posts from a dying Solana token's X Community feed and tag each post with the dissent signals it expresses (if any).

Signals you may assign (multiple allowed per post):
- "absent_dev"          : asking where the dev is, complaining the dev disappeared / rugged / ghosted.
- "no_marketing"        : complaining about lack of dex boosts, dex paid, trending, promos, ads.
- "no_creator_rewards"  : asking the dev to use pump.fun creator rewards / reward pool to help the project.
- "no_communication"    : complaining the dev is silent, no updates, no comms.
- "demanding_action"    : demanding buybacks, burns, plans, the dev to "do something".
- "capitulation"        : holders giving up — "ngmi", "i'm out", "dead coin", "rip", "rugged".
- "benign"              : nothing of the above (memes, neutral chatter, hype, scams handled separately).

Output STRICT JSON only — no prose, no markdown, no code fences. Schema:
{ "posts": [ { "index": <int>, "handle": "...", "signals": ["..."], "confidence": 0-100, "quote": "<<= 200-char verbatim snippet that triggered the strongest signal, or empty>" } ] }

Return one entry per input post in order. Use confidence 70-100 for clear cases, 40-69 for likely, 0-39 for unsure / benign. The "quote" must be verbatim from the post text — do NOT paraphrase.`;

  const lines: string[] = [];
  posts.forEach((p, i) => {
    const pre = preflags[i];
    lines.push(
      `#${i} @${p.handle} ${p.posted_at ?? ''}${pre.flagged ? ` [PRE-FLAGGED: ${pre.signals.join(',')}]` : ''}`,
      `text: ${(p.text ?? '').slice(0, 400).replace(/\s+/g, ' ')}`,
      '',
    );
  });

  const user = `Classify each post below for dissent signals.\n\nPOSTS:\n${lines.join('\n')}`;
  return { system, user };
}
