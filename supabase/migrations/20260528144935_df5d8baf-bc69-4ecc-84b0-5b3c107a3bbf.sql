-- Unstick stale BlackBox harvest jobs that were being retried forever.
UPDATE public.blackbox_aggregator_runs
SET status = 'failed',
    error_message = trim(coalesce(error_message, '') || ' [auto-marked stale: harvest window expired before handoff]')
WHERE status = 'harvesting'
  AND harvest_until < now() - interval '2 minutes';

-- Help the cron pick active harvest rows deterministically and quickly.
CREATE INDEX IF NOT EXISTS idx_blackbox_aggregator_runs_status_harvest_until
  ON public.blackbox_aggregator_runs (status, harvest_until ASC);

-- Help No Lube detect repeated dead-token compose attempts quickly.
CREATE INDEX IF NOT EXISTS idx_no_lube_post_log_mint_verdict_composed
  ON public.no_lube_post_log (token_mint, verdict_class, composed_at DESC);

-- Help pending No Lube lifecycle dispatch scans.
CREATE INDEX IF NOT EXISTS idx_til_ingest_pending_created
  ON public.telegram_insider_token_lifecycle (ingest_status, created_at DESC);