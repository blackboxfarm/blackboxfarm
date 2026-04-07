
-- Add pending_reactivation_emails pruning to the nightly cleanup
-- Using the existing bulk_prune_table pattern but as a direct scheduled delete
SELECT cron.schedule(
  'prune-pending-reactivation-emails',
  '15 3 * * *',
  $$DELETE FROM public.pending_reactivation_emails WHERE processed = true AND created_at < now() - interval '7 days';$$
);
