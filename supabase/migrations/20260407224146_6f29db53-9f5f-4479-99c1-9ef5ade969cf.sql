
CREATE TABLE public.ai_compute_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'web',
  user_id uuid,
  session_id text,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  prompt_tokens integer DEFAULT 0,
  completion_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  response_time_ms integer DEFAULT 0,
  cost_estimate_usd numeric(10,6) DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_compute_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_compute_log"
  ON public.ai_compute_log FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Super admins can view ai_compute_log"
  ON public.ai_compute_log FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_ai_compute_log_created ON public.ai_compute_log (created_at DESC);
CREATE INDEX idx_ai_compute_log_platform ON public.ai_compute_log (platform, created_at DESC);
