-- Purge junk non-token addresses from the post queue
-- These are wallet/pool addresses falsely regex-matched by the funnel scanner
UPDATE public.holders_intel_post_queue
SET status = 'skipped',
    error_message = 'Not a valid token mint (non-pump/non-moon address with no DexScreener pairs)'
WHERE trigger_source = 'funnel_feed'
  AND status = 'pending'
  AND token_mint NOT LIKE '%pump'
  AND token_mint NOT LIKE '%moon';

-- Also mark corresponding funnel_feed_discoveries as failed
UPDATE public.funnel_feed_discoveries
SET xpost_status = 'skipped',
    xpost_processed_at = now()
WHERE token_mint NOT LIKE '%pump'
  AND token_mint NOT LIKE '%moon'
  AND xpost_status IN ('queued', 'pending');