
-- Email verifications table
CREATE TABLE public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_token text NOT NULL UNIQUE,
  verification_type text NOT NULL DEFAULT 'signup' CHECK (verification_type IN ('signup', 'reactivation')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verifications_user ON public.email_verifications(user_id);
CREATE INDEX idx_email_verifications_token ON public.email_verifications(verification_token);
CREATE INDEX idx_email_verifications_unverified ON public.email_verifications(user_id) WHERE verified_at IS NULL;

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verifications"
  ON public.email_verifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to verifications"
  ON public.email_verifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Email tracking events table
CREATE TABLE public.email_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  subject_line text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_tracking_id ON public.email_tracking_events(tracking_id);
CREATE INDEX idx_email_tracking_user ON public.email_tracking_events(user_id);
CREATE INDEX idx_email_tracking_type ON public.email_tracking_events(email_type);
CREATE INDEX idx_email_tracking_sent ON public.email_tracking_events(sent_at DESC);

ALTER TABLE public.email_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to tracking"
  ON public.email_tracking_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read tracking events"
  ON public.email_tracking_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Allow anon inserts for pixel tracking (edge function with no auth)
CREATE POLICY "Anon can update tracking opens"
  ON public.email_tracking_events FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Function: auto-suspend unverified users after 48 hours
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
  -- Find users created > 48h ago who have NO verified email_verifications record
  -- and are not already banned
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE u.created_at < now() - interval '48 hours'
      AND COALESCE(u.banned_until, '1970-01-01'::timestamptz) < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.email_verifications ev
        WHERE ev.user_id = u.id AND ev.verified_at IS NOT NULL
      )
      -- Only users who were SENT a verification (don't suspend users who predate the system)
      AND EXISTS (
        SELECT 1 FROM public.email_verifications ev
        WHERE ev.user_id = u.id AND ev.verification_type = 'signup'
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

-- Schedule the cron job to run every hour
SELECT cron.schedule(
  'auto-suspend-unverified-48h',
  '0 * * * *',
  $$SELECT public.auto_suspend_unverified_users()$$
);

-- Prune tracking events older than 30 days (daily at 4 AM UTC)
SELECT cron.schedule(
  'prune-email-tracking-events',
  '0 4 * * *',
  $$DELETE FROM public.email_tracking_events WHERE created_at < now() - interval '30 days'$$
);
