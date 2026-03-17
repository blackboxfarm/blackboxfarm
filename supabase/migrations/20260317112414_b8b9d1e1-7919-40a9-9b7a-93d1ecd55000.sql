-- Backfill: Update funnel_feed_discoveries xpost_status for tokens already posted
UPDATE funnel_feed_discoveries d
SET xpost_status = 'posted',
    xpost_processed_at = q.posted_at
FROM holders_intel_post_queue q
WHERE q.token_mint = d.token_mint
  AND q.status = 'posted'
  AND d.xpost_status = 'queued';