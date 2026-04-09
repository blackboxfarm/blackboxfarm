

## Manual PUSH Column for Funnel Feed Discoveries

### What this does

Adds a "Manual PUSH" button column to the Funnel Feed discoveries table. When clicked, it triggers the **full holders-intel-poster pipeline** for that specific token: fetches holder report, generates the tweet from the active template, posts to X (@HoldersIntel), broadcasts to Telegram channels, and marks the token as posted throughout the system. After posting, the button is replaced with a Toronto-timezone timestamp.

### Important: X Posting Kill Switch

The `post-share-card-twitter` edge function currently has `X_POSTING_PAUSED = true` (hardcoded). This silently returns `{ success: true, paused: true }` and never actually posts. **We must remove this kill switch** for manual pushes to work. We will add a `manual_override` flag so manual pushes bypass the pause, or simply remove the pause since you want to handle all X posting manually now.

### Architecture

The existing `holders-intel-poster` already does everything needed (fetch report, quality checks, template processing, post tweet, broadcast TG, update seen_tokens, update funnel_feed_discoveries). The manual push will:

1. **Frontend**: Insert a row into `holders_intel_post_queue` with `status: 'pending'`, `trigger_source: 'manual_push'`, then invoke `holders-intel-poster` directly (not waiting for cron)
2. **Edge function**: The poster already processes pending queue items — calling it directly just skips the cron wait
3. **After success**: The discovery row's `xpost_status` updates to `posted`, and the UI shows the Toronto timestamp

### Changes

**1. `supabase/functions/post-share-card-twitter/index.ts`**
- Remove (or bypass) the `X_POSTING_PAUSED` kill switch. Add a `manualOverride` body parameter that skips the pause check, so manual pushes go through while automated posting remains paused if desired.

**2. `src/components/admin/funnel-feeds/FunnelFeedDiscoveries.tsx`**
- Add `manual_pushed_at` tracking in component state (keyed by discovery id)
- Add new "Manual PUSH" table column after "X Post"
- For each row:
  - If `xpost_status === 'posted'` or the token was just pushed: show Toronto timestamp
  - Otherwise: show a "PUSH" button
- On click:
  - Insert into `holders_intel_post_queue` (token_mint, symbol, name, trigger_source: 'manual_push', status: 'pending')
  - Immediately invoke `holders-intel-poster` edge function
  - On success: store timestamp in local state, refresh the list
  - Show loading spinner while processing

**3. `supabase/functions/holders-intel-poster/index.ts`**
- No changes needed. It already processes pending queue items, posts to X, broadcasts to TG, and updates `funnel_feed_discoveries.xpost_status` when `trigger_source` matches. We just need to ensure `trigger_source: 'manual_push'` also triggers the funnel_feed_discoveries update (currently only checks for `'funnel_feed'`). Small fix: update the condition on line 802 to also match `'manual_push'`.

### Technical details

- The poster's quality checks (min holders, grade floor) still apply — if a token fails, the push will return an error shown in a toast
- Toronto timezone formatting: `new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto', ... })`
- The poster handles dedup (won't re-post tokens already marked `posted` in the queue)
- After the poster runs, the discovery's `xpost_status` flips to `posted` in the DB, so on refresh the button stays replaced with timestamp

### Files modified

| File | Purpose |
|------|---------|
| `supabase/functions/post-share-card-twitter/index.ts` | Add `manualOverride` param to bypass X posting pause |
| `supabase/functions/holders-intel-poster/index.ts` | Update funnel_feed_discoveries for `manual_push` trigger_source |
| `src/components/admin/funnel-feeds/FunnelFeedDiscoveries.tsx` | Add PUSH button column, invoke pipeline, show timestamp |

