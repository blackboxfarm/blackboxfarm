-- Ensure SMS feature flag row exists (idempotent)
INSERT INTO public.intelligence_feature_flags (feature_name, enabled, description)
VALUES ('allstar_mint_sms_alerts', false, 'When ON, admin receives SMS for every new allstar dev mint detected.')
ON CONFLICT (feature_name) DO NOTHING;

-- Unschedule previous variant if present (safe no-op if missing)
DO $$
BEGIN
  PERFORM cron.unschedule('allstar-mint-auditor-30min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule allstar-mint-auditor every 30 minutes
SELECT cron.schedule(
  'allstar-mint-auditor-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/allstar-mint-auditor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := '{"audit_batch_size": 25, "hours_lookback": 2}'::jsonb
  ) AS request_id;
  $$
);