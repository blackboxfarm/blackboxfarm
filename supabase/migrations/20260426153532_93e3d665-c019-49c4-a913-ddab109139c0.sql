CREATE TABLE IF NOT EXISTS public.apify_pause_state (
  id              int PRIMARY KEY CHECK (id = 1),
  paused_until    timestamptz,
  reason          text,
  triggered_by    text,
  last_failure_status int,
  last_failure_body   text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.apify_pause_state (id, paused_until, reason)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.apify_pause_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view apify pause state"
ON public.apify_pause_state FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update apify pause state"
ON public.apify_pause_state FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.pause_apify(
  p_minutes int,
  p_reason  text,
  p_status  int DEFAULT NULL,
  p_body    text DEFAULT NULL,
  p_triggered_by text DEFAULT 'system'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_new_until timestamptz := now() + make_interval(mins => p_minutes);
  v_current   timestamptz;
BEGIN
  SELECT paused_until INTO v_current FROM public.apify_pause_state WHERE id = 1;
  IF v_current IS NULL OR v_current < v_new_until THEN
    UPDATE public.apify_pause_state
    SET paused_until = v_new_until,
        reason = p_reason,
        last_failure_status = COALESCE(p_status, last_failure_status),
        last_failure_body = COALESCE(p_body, last_failure_body),
        triggered_by = p_triggered_by,
        updated_at = now()
    WHERE id = 1;
    RETURN v_new_until;
  END IF;
  RETURN v_current;
END $fn$;

CREATE OR REPLACE FUNCTION public.resume_apify(p_triggered_by text DEFAULT 'system')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.apify_pause_state
  SET paused_until = NULL,
      reason = NULL,
      triggered_by = p_triggered_by,
      updated_at = now()
  WHERE id = 1 AND paused_until IS NOT NULL;
END $fn$;