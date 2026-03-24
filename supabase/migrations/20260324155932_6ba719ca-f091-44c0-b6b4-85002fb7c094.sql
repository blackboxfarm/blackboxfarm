-- Step 1: Flush ALL pending items older than 12 hours
UPDATE holders_intel_post_queue
SET status = 'expired', error_message = 'Auto-flushed: stale (>12h old)'
WHERE status = 'pending' AND created_at < now() - interval '12 hours';

-- Step 2: Flush dead tokens (mcap < 30k) from the remaining 0-12h pending items
UPDATE holders_intel_post_queue
SET status = 'expired', error_message = 'Auto-flushed: dead token (mcap < $30k)'
WHERE status = 'pending' AND market_cap IS NOT NULL AND market_cap < 30000;

-- Step 3: Flush tokens with NULL mcap older than 6h (no data = likely dead)
UPDATE holders_intel_post_queue
SET status = 'expired', error_message = 'Auto-flushed: no mcap data after 6h'
WHERE status = 'pending' AND market_cap IS NULL AND created_at < now() - interval '6 hours';