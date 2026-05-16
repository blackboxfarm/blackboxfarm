-- Backfill: revert false-positive "posted" rows from last 48h (no tweet_id, no manual_tweet_url)
-- back to pending so they can post once X comes back. Keep error_message for audit.
UPDATE public.holders_intel_post_queue
SET status = 'pending',
    posted_at = NULL,
    error_message = COALESCE(error_message, '') || ' | backfill: reverted from false-positive posted (no tweet_id) on ' || now()::text
WHERE status = 'posted'
  AND tweet_id IS NULL
  AND manual_tweet_url IS NULL
  AND COALESCE(posted_at, created_at) > now() - interval '48 hours';