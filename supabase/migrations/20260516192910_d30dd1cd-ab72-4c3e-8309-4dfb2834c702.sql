
CREATE OR REPLACE FUNCTION public.holders_intel_queue_auto_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/holders-intel-auto-archive';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';
BEGIN
  -- Only auto-archive freshly-inserted pending rows
  IF COALESCE(NEW.manual_status, 'pending') <> 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('queue_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block inserts on a notify failure
  RAISE WARNING '[holders_intel_queue_auto_archive] %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_holders_intel_queue_auto_archive ON public.holders_intel_post_queue;
CREATE TRIGGER trg_holders_intel_queue_auto_archive
AFTER INSERT ON public.holders_intel_post_queue
FOR EACH ROW
EXECUTE FUNCTION public.holders_intel_queue_auto_archive();
