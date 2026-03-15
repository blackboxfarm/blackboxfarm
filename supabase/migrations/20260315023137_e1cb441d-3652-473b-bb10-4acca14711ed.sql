-- Schedule daily KOL leaderboard refresh at 6:00 AM UTC
SELECT cron.schedule(
  'daily-kol-leaderboard-refresh',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/pumpfun-kol-registry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{"action": "refresh-kolscan", "timeframe": "1"}'::jsonb
  );
  $$
);