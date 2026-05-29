-- Fix Insiders ingest trigger: stop relying on missing app.settings.service_role_key.
-- Edge function insiders-row-ingest runs with verify_jwt=false; the anon key is
-- sufficient to invoke it (the function uses SERVICE_ROLE_KEY from its own env
-- for DB writes). Inline the anon key the same way every other cron job does.

CREATE OR REPLACE FUNCTION public.trg_insiders_call_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel_name IS NULL OR NEW.channel_name NOT ILIKE 'insiders' THEN
    RETURN NEW;
  END IF;
  IF NEW.token_mint IS NULL OR length(NEW.token_mint) < 32 THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/insiders-row-ingest',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU"}'::jsonb,
    body := jsonb_build_object(
      'call_id', NEW.id,
      'mint', NEW.token_mint,
      'symbol', NEW.token_symbol,
      'message_id', NEW.message_id,
      'channel_name', NEW.channel_name,
      'raw_message', NEW.raw_message,
      'message_timestamp', NEW.message_timestamp,
      'source', 'trigger'
    )
  );

  RETURN NEW;
END;
$$;