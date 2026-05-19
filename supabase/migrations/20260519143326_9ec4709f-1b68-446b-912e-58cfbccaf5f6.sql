CREATE TABLE public.feature_suspensions (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null,
  scope text not null default 'other' check (scope in ('edge_function','frontend_feature','cron','bot_command','other')),
  reason text not null,
  notes text,
  suspended_at timestamptz not null default now(),
  suspended_by uuid,
  lifted_at timestamptz,
  lifted_by uuid,
  related_toggle_table text,
  related_toggle_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX idx_feature_suspensions_active ON public.feature_suspensions (suspended_at desc) WHERE lifted_at IS NULL;
CREATE INDEX idx_feature_suspensions_feature_key ON public.feature_suspensions (feature_key);

ALTER TABLE public.feature_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read suspensions"
  ON public.feature_suspensions FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins insert suspensions"
  ON public.feature_suspensions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins update suspensions"
  ON public.feature_suspensions FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins delete suspensions"
  ON public.feature_suspensions FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_feature_suspensions_updated_at
  BEFORE UPDATE ON public.feature_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feature_suspensions (feature_key, scope, reason, notes)
VALUES ('token-ai-interpreter', 'edge_function', 'Admin Suspended — service paused to stop HTTP 402 errors', 'Returns skipped:admin_suspended at runtime; not surfaced as critical alerts');