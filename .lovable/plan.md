

## Plan: Restore holders-intel-poster cron while keeping X posting disabled

### What went wrong
The poster cron was entirely commented out in `reconcile-cron-jobs/index.ts` (lines 59-64). This killed ALL poster work — health snapshots, risk assessment, AI summaries, mesh feeding, Telegram broadcasts — not just the X post.

The X post was ALREADY independently blocked by `X_POSTING_PAUSED = true` inside `post-share-card-twitter` (line 207). The cron comment-out was redundant and destructive.

### What to fix

**Step 1: Uncomment the poster cron**
In `supabase/functions/reconcile-cron-jobs/index.ts`, restore lines 59-64 to active:
```js
{
  jobname: 'holdersintel-poster-3min',
  schedule: '*/3 * * * *',
  command: httpPost('holders-intel-poster', '{}'),
},
```

**Step 2: Make `postTweet` gracefully handle the pause**
In `supabase/functions/holders-intel-poster/index.ts`, modify the `postTweet` call site (around line 786) so that when the downstream function returns `paused: true`, the poster continues its work (updates queue status, seen tokens, mesh feed, etc.) instead of throwing an error and aborting.

Change the flow so:
- `postTweet` returns a "paused" result instead of throwing
- Queue item still gets marked as "posted" (data was processed)
- All downstream work (seen_tokens update, mesh feed, community enrichment, Telegram) still executes
- The only thing skipped is the actual X API call — which `post-share-card-twitter` already blocks

**Step 3: Deploy both functions**
- Deploy `reconcile-cron-jobs` (to re-register the cron)
- Deploy `holders-intel-poster` (with the graceful pause handling)

### What this restores
- Health snapshots written every 3 minutes for queued tokens (Litmus bars)
- Health grades in `holders_intel_seen_tokens`
- Risk assessments
- AI summaries
- Mesh feeding
- X Community auto-enrichment
- All queue processing

### What stays blocked
- The actual Twitter/X API post — still blocked by `X_POSTING_PAUSED = true` in `post-share-card-twitter`

### Technical detail
No database migration needed. No new secrets. Just code edits to two existing Edge Functions and redeployment.

