
-- 1. New columns for dev wallet + latency tracking
ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS dev_wallet text,
  ADD COLUMN IF NOT EXISTS dev_wallet_source text,
  ADD COLUMN IF NOT EXISTS ingest_latency_ms integer;

CREATE INDEX IF NOT EXISTS idx_insider_lifecycle_mint
  ON public.telegram_insider_token_lifecycle (token_mint);

CREATE INDEX IF NOT EXISTS idx_insider_lifecycle_ingest_status
  ON public.telegram_insider_token_lifecycle (ingest_status, created_at DESC);

-- 2. Archive the existing dead-history backlog so the Process tab starts clean.
UPDATE public.telegram_insider_token_lifecycle
SET ingest_status = 'archived',
    ingest_last_error = COALESCE(ingest_last_error, 'pre-pipeline backlog auto-archived')
WHERE ingest_status IS NULL OR ingest_status = 'pending';

-- 3. Per-row event-driven ingest trigger on new Insiders messages.
CREATE OR REPLACE FUNCTION public.trg_insiders_call_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
BEGIN
  IF NEW.channel_name IS NULL OR NEW.channel_name NOT ILIKE 'insiders' THEN
    RETURN NEW;
  END IF;
  IF NEW.token_mint IS NULL OR length(NEW.token_mint) < 32 THEN
    RETURN NEW;
  END IF;

  service_key := current_setting('app.settings.service_role_key', true);
  IF service_key IS NULL OR service_key = '' THEN
    -- Safety sweep will pick it up; don't block the insert.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/insiders-row-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'call_id', NEW.id,
      'mint', NEW.token_mint,
      'symbol', NEW.token_symbol,
      'message_id', NEW.message_id,
      'raw_message', NEW.raw_message,
      'message_timestamp', NEW.message_timestamp,
      'source', 'trigger'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insiders_call_enqueue_aft_ins ON public.telegram_channel_calls;
CREATE TRIGGER trg_insiders_call_enqueue_aft_ins
AFTER INSERT ON public.telegram_channel_calls
FOR EACH ROW
EXECUTE FUNCTION public.trg_insiders_call_enqueue();
