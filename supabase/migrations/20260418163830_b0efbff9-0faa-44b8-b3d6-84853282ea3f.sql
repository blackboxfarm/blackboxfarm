DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobname FROM cron.job
    WHERE jobname ILIKE '%flipit%'
       OR jobname ILIKE '%trading%'
       OR jobname ILIKE '%pumpfun%'
       OR jobname ILIKE '%orchestrator%'
       OR jobname ILIKE '%telegram-channel%'
       OR jobname ILIKE '%scalp%'
       OR jobname ILIKE '%fantasy%'
       OR jobname ILIKE '%buy-executor%'
       OR jobname ILIKE '%sell-monitor%'
       OR jobname ILIKE '%stop-loss%'
       OR jobname ILIKE '%blackbox%'
       OR jobname ILIKE '%intel-xbot%'
       OR jobname ILIKE '%holdersintel-poster%'
       OR jobname ILIKE '%post-queue%'
       OR jobname ILIKE '%banker%'
       OR jobname ILIKE '%arb-%'
       OR jobname ILIKE '%websocket%'
       OR jobname ILIKE '%new-token-monitor%'
       OR jobname ILIKE '%dev-wallet-monitor%'
  LOOP
    PERFORM cron.unschedule(job_record.jobname);
    RAISE NOTICE 'Unscheduled: %', job_record.jobname;
  END LOOP;
END $$;

-- Also kill any pending/processing items in the post queue and any active trading channels
UPDATE public.holders_intel_post_queue
SET status = 'skipped', error_message = 'KILL SWITCH'
WHERE status IN ('pending', 'processing');

UPDATE public.telegram_channel_config
SET is_active = false,
    flipit_enabled = false;

UPDATE public.blackbox_campaigns
SET is_active = false
WHERE is_active = true;

UPDATE public.arb_bot_config
SET auto_trade_enabled = false,
    circuit_breaker_active = true;