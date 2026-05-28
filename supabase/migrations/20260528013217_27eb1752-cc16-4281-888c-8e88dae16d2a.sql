
ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS source_message_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_no_lube_post_log_mint_srcmsg
  ON public.no_lube_post_log (token_mint, source_message_id)
  WHERE source_message_id IS NOT NULL AND posted = true;

UPDATE public.blackbox_aggregator_runs
SET status = 'failed', error_message = COALESCE(error_message,'') || ' [auto-marked stale by repair migration]'
WHERE status = 'harvesting' AND harvest_until < now() - INTERVAL '5 minutes';
