-- Add notification columns to flip_limit_orders
ALTER TABLE flip_limit_orders 
  ADD COLUMN IF NOT EXISTS notify_telegram_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_only BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN flip_limit_orders.notify_telegram_group IS 'Send alert to BLACKBOX Telegram group';
COMMENT ON COLUMN flip_limit_orders.alert_only IS 'Only send alert when conditions met, do not execute buy';
COMMENT ON COLUMN flip_limit_orders.notification_email IS 'Custom email address for notifications';