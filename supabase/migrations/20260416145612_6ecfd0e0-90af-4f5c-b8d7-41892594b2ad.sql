
CREATE OR REPLACE FUNCTION public.update_dex_cron_interval(minutes_interval INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cron_expr TEXT;
  cron_sql TEXT;
BEGIN
  IF minutes_interval NOT IN (15, 30, 60) THEN
    RAISE EXCEPTION 'Invalid interval: must be 15, 30, or 60';
  END IF;
  
  cron_expr := '*/' || minutes_interval || ' * * * *';
  
  cron_sql := 'SELECT net.http_post(url := ''https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/dex-top-200'', headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}''::jsonb, body := concat(''{"time": "'', now(), ''"}'')::jsonb) AS request_id;';

  -- Unschedule if exists
  BEGIN
    PERFORM cron.unschedule('invoke-dex-top-200');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Schedule with new interval
  PERFORM cron.schedule('invoke-dex-top-200', cron_expr, cron_sql);
  
  -- Update config table
  UPDATE public.dex_scrape_config 
  SET value = jsonb_build_object('interval_minutes', minutes_interval),
      updated_at = now()
  WHERE key = 'polling_interval';
END;
$fn$;
