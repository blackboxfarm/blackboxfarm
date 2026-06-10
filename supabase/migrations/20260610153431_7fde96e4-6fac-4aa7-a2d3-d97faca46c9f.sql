
CREATE OR REPLACE FUNCTION public.bump_channel_failure(p_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.channel_health
     SET consecutive_failures = consecutive_failures + 1,
         total_failures = total_failures + 1
   WHERE profile_kind = p_kind;
$$;

GRANT EXECUTE ON FUNCTION public.bump_channel_failure(text) TO service_role;

-- Backfill search_path on previously-created functions to clear linter warning
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
