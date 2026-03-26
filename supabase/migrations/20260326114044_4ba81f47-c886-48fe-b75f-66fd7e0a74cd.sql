-- Expire established tokens currently pending (>7d old in token_lifecycle, >500k mcap)
UPDATE holders_intel_post_queue pq
SET status = 'expired',
    trigger_comment = COALESCE(trigger_comment, '') || ' | auto: established token'
FROM token_lifecycle tl
WHERE pq.token_mint = tl.token_mint
  AND pq.status = 'pending'
  AND tl.market_cap > 500000
  AND (
    (tl.pair_created_at IS NOT NULL AND tl.pair_created_at < NOW() - INTERVAL '7 days')
    OR (tl.pair_created_at IS NULL AND tl.first_seen_at < NOW() - INTERVAL '7 days')
  );