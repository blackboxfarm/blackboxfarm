SELECT cron.schedule(
  'prune-allstar-audit-check-log-daily',
  '17 4 * * *',
  $$SELECT public.prune_allstar_audit_check_log();$$
);