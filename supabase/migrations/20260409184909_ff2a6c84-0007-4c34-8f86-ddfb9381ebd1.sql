
-- Add renewal_reminder_sent flag to tg_sol_subscriptions
ALTER TABLE public.tg_sol_subscriptions
ADD COLUMN IF NOT EXISTS renewal_reminder_sent boolean DEFAULT false;

-- Add sol-renewal-reminder to the reconcile cron list is handled in code, 
-- but let's ensure the column default is set properly
UPDATE public.tg_sol_subscriptions
SET renewal_reminder_sent = false
WHERE renewal_reminder_sent IS NULL;
