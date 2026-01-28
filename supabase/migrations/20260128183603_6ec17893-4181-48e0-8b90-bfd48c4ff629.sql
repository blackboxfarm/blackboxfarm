CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS TABLE(jobname text, schedule text, active boolean)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT jobname::text, schedule::text, active 
  FROM cron.job 
  WHERE jobname LIKE 'holdersintel%' OR jobname LIKE 'twitter-scanner%'
  ORDER BY jobname;
$function$;