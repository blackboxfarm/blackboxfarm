-- Purge noisy API/firecrawl admin alerts. These are now hard-muted at source.
DELETE FROM public.admin_notifications
WHERE notification_type IN (
  'api_auth_failure',
  'api_failure_escalation',
  'api_failure_critical',
  'api_failure_warning',
  'firecrawl_self_throttle',
  'firecrawl_unknown'
);
