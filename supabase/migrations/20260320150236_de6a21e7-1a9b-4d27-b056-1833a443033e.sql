-- Auto-enrich key Twitter accounts daily at 07:00 UTC
-- This calls twitter-profile-enricher for accounts not enriched in the last 20 hours
SELECT cron.schedule(
  'daily-twitter-profile-refresh',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/twitter-profile-enricher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := (
      SELECT jsonb_build_object('usernames', jsonb_agg(username))
      FROM (
        SELECT username FROM public.twitter_accounts
        WHERE is_tracked = true
          AND (last_enriched_at IS NULL OR last_enriched_at < now() - interval '20 hours')
        ORDER BY follower_count DESC NULLS LAST
        LIMIT 25
      ) sub
    )
  );
  $$
);