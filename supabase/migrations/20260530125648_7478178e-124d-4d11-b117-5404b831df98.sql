
-- Seed No Lube leaderboard profile
INSERT INTO public.leaderboard_profiles (
  id, display_name, day_start_hour, timezone, post_hour,
  accent_hex, brand_tagline, post_to_tg_public, post_to_tg_private, enabled,
  bg_public_prompt, bg_private_prompt
) VALUES (
  'no_lube', 'No Lube', 6, 'America/Toronto', 4,
  '#22d3ee', 'No Lube', true, true, true,
  'Abstract dark cyberpunk background with subtle cyan neon grid lines, premium trading dashboard aesthetic, 1200x1500 portrait, no text',
  'Abstract dark luxury background with gold and cyan accents, premium private members aesthetic, 1200x1500 portrait, no text'
) ON CONFLICT (id) DO NOTHING;

-- Ensure pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule hourly leaderboard builder
SELECT cron.schedule(
  'leaderboard-daily-builder-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/leaderboard-daily-builder',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := jsonb_build_object('ts', now())
  ) AS request_id;
  $$
);
