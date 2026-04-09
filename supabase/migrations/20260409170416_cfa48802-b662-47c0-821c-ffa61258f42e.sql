
-- Update the auto-suspend function to 7 days and skip TG-linked + subscriber accounts
CREATE OR REPLACE FUNCTION public.auto_suspend_unverified_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  reactivation_token text;
BEGIN
  -- Find users created > 7 days ago who have NO verified email_verifications record
  -- and are not already banned
  -- SKIP users who have linked Telegram or have an active subscription
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE u.created_at < now() - interval '7 days'
      AND COALESCE(u.banned_until, '1970-01-01'::timestamptz) < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.email_verifications ev
        WHERE ev.user_id = u.id AND ev.verified_at IS NOT NULL
      )
      -- Only users who were SENT a verification
      AND EXISTS (
        SELECT 1 FROM public.email_verifications ev
        WHERE ev.user_id = u.id AND ev.verification_type = 'signup'
      )
      -- Skip users with linked Telegram
      AND NOT EXISTS (
        SELECT 1 FROM public.telegram_link_codes tlc
        WHERE tlc.user_id = u.id AND tlc.telegram_user_id IS NOT NULL
      )
      -- Skip users with active subscriptions
      AND NOT EXISTS (
        SELECT 1 FROM public.web_user_subscriptions ws
        WHERE ws.user_id = u.id AND ws.is_active = true
      )
  LOOP
    -- Ban the user
    PERFORM public.ban_user(r.id);

    -- Create a reactivation token
    reactivation_token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.email_verifications (user_id, verification_token, verification_type, expires_at)
    VALUES (r.id, reactivation_token, 'reactivation', now() + interval '30 days');
  END LOOP;
END;
$$;

-- Update default expiry for new email verifications from 48h to 7 days
ALTER TABLE public.email_verifications ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

-- Reschedule the cron job with updated name
SELECT cron.unschedule('auto-suspend-unverified-48h');
SELECT cron.schedule(
  'auto-suspend-unverified-7d',
  '0 * * * *',
  $$SELECT public.auto_suspend_unverified_users()$$
);
