-- Add attribution + dedup fields to intel_briefing_views
ALTER TABLE public.intel_briefing_views
  ADD COLUMN IF NOT EXISTS referrer_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_briefing_views_referrer_source
  ON public.intel_briefing_views(referrer_source);

CREATE INDEX IF NOT EXISTS idx_briefing_views_utm_source
  ON public.intel_briefing_views(utm_source);

CREATE INDEX IF NOT EXISTS idx_briefing_views_session_lookup
  ON public.intel_briefing_views(briefing_id, session_id, created_at DESC);

-- Tighten SELECT policy: only admins can read raw view rows (PII: IPs, UAs, referers).
-- The aggregate view intel_briefing_view_stats remains usable.
DROP POLICY IF EXISTS "Authenticated users can read views" ON public.intel_briefing_views;

CREATE POLICY "Admins can read views"
  ON public.intel_briefing_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));