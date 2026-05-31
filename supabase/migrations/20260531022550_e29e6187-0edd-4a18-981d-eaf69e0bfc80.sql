DELETE FROM public.admin_notifications
WHERE notification_type IN ('api_auth_failure','api_failure_escalation')
  AND (metadata->>'service' = 'solscan' OR title ILIKE '%solscan%' OR message ILIKE '%solscan%');