
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  source text NOT NULL,
  message text NOT NULL,
  context jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system alerts"
ON public.system_alerts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system alerts"
ON public.system_alerts FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved ON public.system_alerts (last_seen_at DESC) WHERE resolved_at IS NULL;

UPDATE public.no_lube_post_log
SET channel = 'private'
WHERE channel IS NULL AND posted = true;
