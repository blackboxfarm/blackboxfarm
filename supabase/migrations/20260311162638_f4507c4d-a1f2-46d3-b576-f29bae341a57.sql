-- Store daily aggregated Helius usage snapshots (persisted even after log pruning)
CREATE TABLE public.helius_usage_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  function_name TEXT NOT NULL,
  total_calls BIGINT NOT NULL DEFAULT 0,
  total_credits BIGINT NOT NULL DEFAULT 0,
  successful_calls BIGINT NOT NULL DEFAULT 0,
  failed_calls BIGINT NOT NULL DEFAULT 0,
  avg_response_time_ms NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date, function_name)
);

-- Enable RLS
ALTER TABLE public.helius_usage_snapshots ENABLE ROW LEVEL SECURITY;

-- Only super admins can read/write
CREATE POLICY "Super admins can read helius usage snapshots"
  ON public.helius_usage_snapshots FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert helius usage snapshots"
  ON public.helius_usage_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Also allow service role (edge functions) to insert via no RLS bypass
-- Service role bypasses RLS by default, so no extra policy needed

-- Create index for fast date range queries
CREATE INDEX idx_helius_snapshots_date ON public.helius_usage_snapshots(snapshot_date DESC);
CREATE INDEX idx_helius_snapshots_function ON public.helius_usage_snapshots(function_name);