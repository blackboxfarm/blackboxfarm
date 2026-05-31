## Goal

Re-enable BlackBox bait posts so Insiders mints (like $GOODCOIN) actually hit the group, trigger trader-bot replies, and flow into Private.

## Why it was muted

`BLACKBOX_GROUP_MUTED = true` was added as a blunt kill-switch to stop hammering Phanes when there were no rate-limit guards. Those guards now exist, so the kill-switch is obsolete and is the sole reason the pipeline is dead.

## Change

In `supabase/functions/blackbox-tick/index.ts`:

1. Line 23: `const BLACKBOX_GROUP_MUTED = true;` → `false`.
2. Delete the muted-branch block at lines 444–458 (it just stamps every run as `failed: muted: BLACKBOX kill-switch`).
3. Leave the bare-CA bait post (lines 460–476) as the only group post. The full Holders Report post stays suspended — that's a separate, deliberate Phanes-protection decision and not what's blocking the pipeline.

## Existing protections that stay in place

- 60-second global throttle between bait posts (lines 402–405).
- Hard cap of 1 bait post per tick (line 417/419).
- Per-bot Phanes cooldown logic (lines 371–392).
- Dedup on `(token_mint, source_message_id)` so the same Insiders call can't double-post.

## Result

Next Insiders mint → `blackbox-tick` posts the bare CA into the BlackBox group → trader bots auto-reply → `blackbox_bot_replies` populates → harvest → Private channel digest fires. $GOODCOIN-style silent drops stop.
