-- Create RPC function to get cron job status for Intel XBot
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE(jobname text, schedule text, active boolean) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jobname::text, schedule::text, active 
  FROM cron.job 
  WHERE jobname LIKE 'holdersintel%'
  ORDER BY jobname;
$$;