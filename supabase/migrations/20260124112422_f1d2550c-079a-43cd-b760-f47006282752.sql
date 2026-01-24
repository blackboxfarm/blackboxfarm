-- Create a helper function to schedule cron jobs
CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  job_name TEXT,
  job_schedule TEXT,
  job_command TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  -- Schedule the cron job
  PERFORM cron.schedule(job_name, job_schedule, job_command);
END;
$$;