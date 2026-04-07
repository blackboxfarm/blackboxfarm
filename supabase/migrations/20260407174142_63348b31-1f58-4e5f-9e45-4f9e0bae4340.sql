
-- Table to queue reactivation emails for processing by an edge function
CREATE TABLE IF NOT EXISTS public.pending_reactivation_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  reactivation_token text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_reactivation_emails ENABLE ROW LEVEL SECURITY;

-- Only service role needs access
CREATE POLICY "Service role full access on pending_reactivation_emails"
  ON public.pending_reactivation_emails
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_pending_reactivation_unprocessed 
  ON public.pending_reactivation_emails (processed) WHERE processed = false;

-- Update the auto-suspend function to also queue reactivation emails
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
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE u.created_at < now() - interval '48 hours'
      AND COALESCE(u.banned_until, '1970-01-01'::timestamptz) < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.email_verifications ev
        WHERE ev.user_id = u.id AND ev.verified_at IS NOT NULL
      )
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

    -- Queue the reactivation email for sending
    INSERT INTO public.pending_reactivation_emails (user_id, email, reactivation_token)
    VALUES (r.id, r.email, reactivation_token);
  END LOOP;
END;
$$;

-- Function to find users at the 24h mark who need a reminder
CREATE OR REPLACE FUNCTION public.get_24h_unverified_users()
RETURNS TABLE(user_id uuid, email text, signup_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text, ev.verification_token
  FROM auth.users u
  JOIN public.email_verifications ev ON ev.user_id = u.id AND ev.verification_type = 'signup'
  WHERE u.created_at BETWEEN now() - interval '36 hours' AND now() - interval '24 hours'
    AND COALESCE(u.banned_until, '1970-01-01'::timestamptz) < now()
    AND ev.verified_at IS NULL
    -- Don't send reminder if we already sent one (check email_tracking_events)
    AND NOT EXISTS (
      SELECT 1 FROM public.email_tracking_events ete
      WHERE ete.user_id = u.id AND ete.email_type = 'verification_reminder'
    );
END;
$$;
