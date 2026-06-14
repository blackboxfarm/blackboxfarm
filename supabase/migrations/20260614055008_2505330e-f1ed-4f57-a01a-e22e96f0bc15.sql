
CREATE TABLE public.waterfall_cascade_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_index integer NOT NULL,
  status text NOT NULL DEFAULT 'running',
  current_wallet_row integer,
  current_step text,
  hop_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid
);

GRANT SELECT ON public.waterfall_cascade_runs TO authenticated;
GRANT ALL ON public.waterfall_cascade_runs TO service_role;

ALTER TABLE public.waterfall_cascade_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read cascade runs"
ON public.waterfall_cascade_runs FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_waterfall_cascade_runs_column ON public.waterfall_cascade_runs(column_index, started_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.waterfall_cascade_runs;
ALTER TABLE public.waterfall_cascade_runs REPLICA IDENTITY FULL;
