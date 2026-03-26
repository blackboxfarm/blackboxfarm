-- Clean up stuck "processing" entries older than 6 hours
UPDATE holders_intel_post_queue
SET status = 'failed',
    trigger_comment = COALESCE(trigger_comment, '') || ' | auto-cleanup: stuck processing'
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '6 hours';

-- Expire oldest pending entries beyond 100 to prevent backlog flood
UPDATE holders_intel_post_queue
SET status = 'expired',
    trigger_comment = COALESCE(trigger_comment, '') || ' | auto-cleanup: backlog cap'
WHERE status = 'pending'
  AND id NOT IN (
    SELECT id FROM holders_intel_post_queue
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT 100
  );