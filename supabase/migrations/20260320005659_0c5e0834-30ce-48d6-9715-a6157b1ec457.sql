-- Function to list current cron job names (used by reconcile-cron-jobs)
CREATE OR REPLACE FUNCTION public.get_cron_job_names()
RETURNS TABLE(jobname text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jobname::text FROM cron.job;
$$;

-- Function to execute cron.schedule calls (used by reconcile-cron-jobs)
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  EXECUTE query;
END;
$$;

-- Revoke public access - only service_role should call these
REVOKE ALL ON FUNCTION public.get_cron_job_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_job_names() TO service_role;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;