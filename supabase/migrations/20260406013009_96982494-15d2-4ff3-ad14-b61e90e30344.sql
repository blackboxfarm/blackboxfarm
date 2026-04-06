
-- Drop overly permissive anon policy
DROP POLICY IF EXISTS "Anon can update tracking opens" ON public.email_tracking_events;

-- Allow anon inserts for pixel tracking edge function (no auth)
CREATE POLICY "Anon can insert tracking events"
  ON public.email_tracking_events FOR INSERT
  TO anon
  WITH CHECK (true);
