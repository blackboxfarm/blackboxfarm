
# No Lube flow — lock it in, end to end

I hear you. The flow is simple. I'm going to make the code match the flow exactly, no more drift.

## The flow (canonical)

```text
1. Insiders channel posts a token
        |
        v
2. telegram-channel-monitor inserts the row
        |  (DB trigger fires immediately)
        v
3. insiders-row-ingest
   - parse Insiders MC -> upsert_mesh_entry_mcap(source='insiders')
   - kick BlackBox: forward mint to BlackBox group, scrape Phanes + DrRick replies
   - scrape gives us: current MC, entry MC, socials, dev stats
   - upsert_mesh_entry_mcap(source='blackbox' | 'phanes' | 'drrick')
   - run bagless-holders-report (our own HoldersIntel scrape)
   - upsert_mesh_entry_mcap(source='holdersintel')
        |
        v
4. no-lube-orchestrate (snapshot)
   - POST quick snapshot to PRIVATE channel (fast, minimal)
   - log in no_lube_post_log as post_kind='snapshot'
        |
        v
5. no-lube-orchestrate (big_picture, ~minutes later, after enrichment)
   - POST full intel report to PRIVATE channel
   - log as post_kind='big_picture'
        |
        v
6. Re-sighting / multiplier gate (every minute via sweeper +
                                  every new Insiders milestone row)
   - current_mcap / entry_mcap_usd = ratio
   - if ratio >= next unposted multiplier tier (2x, 3x, 5x, 10x, 20x, 50x, 100x):
        * generate multiplier image (mint logo + Nx badge)
        * POST to PRIVATE channel (with image)
        * POST to PUBLIC channel (with image)
        * log as post_kind='multiplier', multiplier_tier=N
```

## What's actually broken right now

After auditing the last few hours of `$CUM` (the token you flagged) and the post log:

1. **`no-lube-orchestrate` only posts snapshot + big_picture.** The "multiplier" branch was bolted on but it doesn't trigger a second post — it just updates `peak_multiplier`. That's why you saw zero 2x/18x/20x posts even after the sweeper was fixed.
2. **No image is generated for multiplier posts.** Multiplier posts (when they did fire) went out as text only.
3. **Multiplier posts only went to the default channel,** never fan-out to both private + public.
4. **The "use lowest MC across Insiders + BlackBox + HoldersIntel scrapes within 30 min" rule is now correct in `upsert_mesh_entry_mcap`,** but `no-lube-orchestrate` is still reading `entry_market_cap` from the lifecycle row in some paths instead of the Mesh row, so the ratio can be wrong.
5. **Insiders milestone messages** (e.g. "MILESTONE: 20X") land as a new `telegram_channel_calls` row but they don't directly poke `no-lube-orchestrate` — they rely on the 1-min sweeper, which then short-circuits because the milestone branch doesn't post.

## What I will change (build mode)

### A. `no-lube-orchestrate` — add the multiplier post branch

- After snapshot + big_picture exist for a mint, on every invocation:
  - Read `entry_mcap_usd` from `holders_intel_seen_tokens` (Mesh row — single source of truth).
  - Read live `current_mcap` from DexScreener (fail if stale > 5 min).
  - `ratio = current_mcap / entry_mcap_usd`.
  - Look up the highest `multiplier_tier` already posted in `no_lube_post_log` for this mint.
  - For each tier in `[2, 3, 5, 10, 20, 50, 100]` where `tier <= ratio` and `tier > last_posted_tier`:
    - Generate multiplier image (reuse the existing autopsy image pipeline — mint logo, ticker, big `Nx` badge, entry → current MC).
    - Compose text: ticker, multiplier, entry MC, current MC, time since first call, top dev signal.
    - Call `no-lube-push` with `channel='private'` + `image_url`.
    - Call `no-lube-push` with `channel='public'` + `image_url`.
    - Insert two rows into `no_lube_post_log` with `post_kind='multiplier'`, `multiplier_tier=N`, one per channel.
  - Stop after the highest unposted tier so we don't spam every tier at once when a token jumps from 1x to 20x — post only the highest tier and mark lower ones as `skipped_lower_tier=true`.

### B. Direct trigger on Insiders milestone rows

- Extend `trg_insiders_call_enqueue_aft_ins` so that when the new `telegram_channel_calls` row matches `/MILESTONE:\s*(\d+(\.\d+)?)X/i`, it calls `no-lube-orchestrate` directly with `source='insiders-milestone'` and the parsed multiplier — no waiting for the sweeper.
- `insiders-row-ingest` already parses milestone messages; have it also call `upsert_mesh_entry_mcap` with the milestone-row MC under the 30-min discovery window guard (so a milestone MC that arrives at minute 31 cannot lower Entry MC — exactly your rule).

### C. Mesh-first reads in orchestrate

- Replace every `select entry_market_cap from telegram_insider_token_lifecycle` in `no-lube-orchestrate` with `select entry_mcap_usd from holders_intel_seen_tokens`.
- `lock_entry_mcap` already syncs lifecycle ← mesh, so no other call site breaks.

### D. Image generation for multiplier posts

- New small helper `multiplier-image` edge function (or reuse `autopsy-image` with `mode='multiplier'`) that returns a public URL to a 1200x630 image with: token logo, `$TICKER`, big gold `20X` badge, entry MC → current MC, "Called by Insiders, mirrored by HoldersIntel" footer.
- Cache by `mint + tier` so we never re-render the same image.

### E. Backfill the $CUM misses

- One-shot script: for every mint with `peak_multiplier >= 2` and no `multiplier` rows in `no_lube_post_log`, replay the multiplier branch (with image, both channels). $CUM gets its 2x, 18x, and 20x posts retroactively so the public channel isn't a graveyard.

## Verification before I declare done

1. Pick a token already in the system that's pumped (e.g. $CUM at 20x). Run orchestrate manually — confirm multiplier post lands in PRIVATE and PUBLIC with the image.
2. Insert a fake `MILESTONE: 3X` row for a test mint into `telegram_channel_calls` — confirm the DB trigger fires orchestrate within seconds and a 3x post lands in both channels.
3. Verify `entry_mcap_usd` in Mesh = lowest of (Insiders MC, BlackBox MC, HoldersIntel MC) seen within 30 min of `first_seen_at`, and any later (dumped) MC is ignored.
4. Pull the last 24h of `no_lube_post_log` and confirm: every mint with `peak_multiplier >= 2` has at least one `post_kind='multiplier'` row.

## Files I will touch

- `supabase/functions/no-lube-orchestrate/index.ts` — add multiplier branch, switch to Mesh reads
- `supabase/functions/no-lube-push/index.ts` — already supports `channel` + `image_url`, no change
- `supabase/functions/insiders-row-ingest/index.ts` — fire milestone MC into Mesh + orchestrate
- New: `supabase/functions/multiplier-image/index.ts` (or extend autopsy-image)
- New migration: extend `trg_insiders_call_enqueue_aft_ins` for milestone rows; add `multiplier_tier` column to `no_lube_post_log` if not present; backfill script as a one-shot RPC
- `.lovable/plan.md` — update to reflect this canonical flow

Say **Plan Approved** and I'll build it.
