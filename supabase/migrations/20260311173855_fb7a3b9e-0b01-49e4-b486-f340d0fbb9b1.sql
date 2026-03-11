-- Purge stale fantasy buy/sell notifications (all from Feb, 14+ days old)
DELETE FROM admin_notifications 
WHERE notification_type IN ('fantasy_buy', 'fantasy_sell')
  AND created_at < now() - interval '7 days';

-- Also mark all old unread notifications as read
UPDATE admin_notifications 
SET is_read = true, read_at = now()
WHERE is_read = false 
  AND created_at < now() - interval '7 days';