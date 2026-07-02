
ALTER TABLE public.blackbox_aggregator_runs
  ADD COLUMN IF NOT EXISTS var_bag_jsonb jsonb,
  ADD COLUMN IF NOT EXISTS var_bag_stage text,
  ADD COLUMN IF NOT EXISTS var_bag_counts jsonb,
  ADD COLUMN IF NOT EXISTS var_bag_updated timestamptz;

CREATE TABLE IF NOT EXISTS public.token_var_history (
  id bigserial PRIMARY KEY,
  token_mint text NOT NULL,
  run_id uuid,
  var_key text NOT NULL,
  value_jsonb jsonb,
  source text,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_var_history_key ON public.token_var_history (token_mint, var_key, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_var_history_run ON public.token_var_history (run_id);
GRANT SELECT ON public.token_var_history TO authenticated;
GRANT ALL ON public.token_var_history TO service_role;
ALTER TABLE public.token_var_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_history" ON public.token_var_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_history" ON public.token_var_history FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.token_var_immutable (
  token_mint text NOT NULL,
  var_key text NOT NULL,
  value_jsonb jsonb,
  source text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_mint, var_key)
);
GRANT SELECT ON public.token_var_immutable TO authenticated;
GRANT ALL ON public.token_var_immutable TO service_role;
ALTER TABLE public.token_var_immutable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_immut" ON public.token_var_immutable FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_immut" ON public.token_var_immutable FOR SELECT TO authenticated USING (true);
