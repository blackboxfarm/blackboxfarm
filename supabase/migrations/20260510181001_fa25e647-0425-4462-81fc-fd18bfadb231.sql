CREATE TABLE IF NOT EXISTS public.coverage_milestone_state (
  metric_key TEXT PRIMARY KEY,
  last_pct INTEGER NOT NULL DEFAULT -1,
  last_notified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coverage_milestone_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.coverage_milestone_state FOR ALL USING (false);
INSERT INTO public.coverage_milestone_state (metric_key, last_pct) VALUES ('dev_wallet', -1), ('kyc_traced', -1)
ON CONFLICT (metric_key) DO NOTHING;