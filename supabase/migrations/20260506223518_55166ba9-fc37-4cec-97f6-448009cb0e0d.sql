ALTER TABLE public.holders_intel_post_queue
  ADD COLUMN IF NOT EXISTS tweet_text text,
  ADD COLUMN IF NOT EXISTS manual_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS manual_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_tweet_url text,
  ADD COLUMN IF NOT EXISTS manual_posted_by uuid,
  ADD COLUMN IF NOT EXISTS manual_skip_reason text;

CREATE INDEX IF NOT EXISTS idx_hipq_manual_status_created
  ON public.holders_intel_post_queue (manual_status, created_at DESC);

DROP POLICY IF EXISTS "Super admins can update manual posting fields"
  ON public.holders_intel_post_queue;

CREATE POLICY "Super admins can update manual posting fields"
  ON public.holders_intel_post_queue
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));