
User raises a valid concern: the current "first-time only" guard only checks if **we** previously bought from that channel — but if the channel posted the token before we activated the rule, OR if the message is a follow-up "2x / 3x / 4x" pump update, we'd wrongly treat it as a fresh call and buy a token that's already mooned.

## Two-layer fix

### Layer 1: Historical message scan (last 50 msgs in the channel)
Before triggering an auto-buy, query `telegram_channel_calls` for the same `channel_id` + `token_mint` with `message_timestamp < now`. If ANY prior call exists → skip. This catches tokens the channel called before our rule existed.

### Layer 2: Multiplier-notation regex guard
Scan the `raw_message` text for "follow-up call" patterns. If matched → skip (it's a pump update, not a fresh call):
- `\b\d+(\.\d+)?x\b` (2x, 2.5x, 10x)
- `\bATH\b`, `\ball.?time.?high\b`
- `\b(up|pumped?|did)\s+\d+x\b`
- `\bfrom\s+\$?\d+[kKmM]?\s+to\s+\$?\d+[kKmM]?\b` (e.g. "from 50k to 200k")
- `🚀{2,}` or `📈` repeated (often follow-up hype)
- `\bcalled\s+(at|@)\b` (retroactive brag)

Case-insensitive. Log the matched pattern when skipping so we can tune.

## Where it goes

`supabase/functions/telegram-channel-monitor/index.ts` — extend the existing first-time-only guard block. Two additional checks, both BEFORE the buy fires. Both are pure-read; no schema changes.

## Optional surfacing
Add a small "Skipped (reason)" counter to `ChannelAutoBuyRules.tsx` so the user can see how often the guard fires. Skip for v1 unless requested.

## Files touched
- `supabase/functions/telegram-channel-monitor/index.ts` — add historical scan + multiplier regex inside the existing first-time guard

## Out of scope
- Persisting skip reasons to a new table (logs only for v1)
- AI classification of messages (regex is faster + cheaper; revisit if false-positives appear)
