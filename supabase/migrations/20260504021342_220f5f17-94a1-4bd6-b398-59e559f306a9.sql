CREATE TABLE IF NOT EXISTS public.autopsy_pipeline_events (
  id BIGSERIAL PRIMARY KEY,
  candidate_id UUID NOT NULL,
  phase TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','ok','fail','skipped','info')),
  detail TEXT,
  reason TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopsy_pipeline_events_candidate_created
  ON public.autopsy_pipeline_events (candidate_id, created_at DESC);

ALTER TABLE public.autopsy_pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins can read pipeline events"
  ON public.autopsy_pipeline_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.autopsy_pipeline_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.autopsy_pipeline_events;