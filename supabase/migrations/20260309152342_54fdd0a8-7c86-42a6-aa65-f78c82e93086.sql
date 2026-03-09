-- Reset failed and pending queue items for retry
UPDATE holders_intel_post_queue 
SET status = 'pending', 
    error_message = NULL, 
    scheduled_at = now() + interval '2 minutes'
WHERE status IN ('failed', 'pending');