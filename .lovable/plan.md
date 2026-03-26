

# Plan: Disable All X (Twitter) Posting

Your X account is suspended, so all posting attempts are wasting cycles and logging 401 errors. Here's what needs to be stopped:

## What Posts to X

There are **3 functions** that post to X:

1. **`holders-intel-poster`** — Main Intel XBot pipeline (runs every 3 min via cron). Posts token analysis tweets via `post-share-card-twitter`.
2. **`fantasy-tweet`** — Fantasy trading buy/sell tweets (called on-demand from scalp system).
3. **`post-share-card-twitter`** — Shared tweet-sending utility used by the poster above.

## Plan

### Step 1: Add an X Posting Kill Switch
Add a simple **early-exit guard** at the top of `post-share-card-twitter/index.ts` (the shared posting gateway) that returns a "paused" response without calling the Twitter API. This single change blocks ALL X posts from every caller (holders-intel-poster, fantasy-tweet, manual posts).

### Step 2: Add the Same Guard to `fantasy-tweet/index.ts`
Since fantasy-tweet calls the Twitter API directly (not via post-share-card-twitter), add the same early-exit guard there too.

### Step 3: Pause the Poster Cron (Optional but Saves Cycles)
Skip the `holders-intel-poster` cron in `reconcile-cron-jobs` by commenting it out or adding a flag, so the poster doesn't even run every 3 minutes generating tweets that can't be sent. The scheduler and dex-scanner can keep running to accumulate data.

## Technical Details

- **`post-share-card-twitter/index.ts`**: Add at top of handler:
  ```typescript
  // X account suspended — block all tweets
  const X_POSTING_PAUSED = true;
  if (X_POSTING_PAUSED) {
    return new Response(JSON.stringify({ success: true, paused: true, reason: 'X posting disabled — account suspended' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  ```

- **`fantasy-tweet/index.ts`**: Same guard after the OPTIONS check.

- **`reconcile-cron-jobs/index.ts`**: Comment out the `holdersintel-poster-3min` entry so the poster stops running every 3 minutes.

- **`holders-intel-poster/index.ts`**: No changes needed — it will naturally stop when post-share-card-twitter returns `paused: true`. But with the cron disabled, it won't even be called.

This approach is easily reversible: just set `X_POSTING_PAUSED = false` and uncomment the cron when your account is restored.

