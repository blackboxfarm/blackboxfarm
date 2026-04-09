

## Fix Manual PUSH to Use the Direct Post Flow

### Problem

The PUSH button in Funnel Feed discoveries was wired to insert into `holders_intel_post_queue` and then invoke `holders-intel-poster` — a complex pipeline with kill switches, queue logic, and expiration rules. This is why pushes kept failing silently.

### The Fix

Wire the PUSH button to use the **exact same flow** as the "Manual API Post" section in the Social tab:

1. Call `bagless-holders-report` with the token mint → get holder data
2. Process the active large template with the fetched stats
3. Call `post-share-card-twitter` directly with the rendered tweet text (no `manualOverride` needed — this bypasses the queue entirely)
4. On success, update `funnel_feed_discoveries.xpost_status = 'posted'` and show the Toronto timestamp

### What changes

| File | Change |
|------|--------|
| `src/components/admin/funnel-feeds/FunnelFeedDiscoveries.tsx` | Rewrite `handlePush` to: (1) fetch holder report via `bagless-holders-report`, (2) fetch templates from DB, (3) render the large template, (4) post directly via `post-share-card-twitter`, (5) update discovery status to `posted`, (6) show timestamp |

### What this removes

- No more inserting into `holders_intel_post_queue` for manual pushes
- No more invoking `holders-intel-poster` (with its kill switch, queue expiry, etc.)
- Direct path: Fetch → Template → Post → Done

