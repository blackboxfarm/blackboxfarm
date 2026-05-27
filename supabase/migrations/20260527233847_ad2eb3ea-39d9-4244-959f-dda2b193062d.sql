UPDATE public.blackbox_aggregator_runs
SET status = 'failed',
    error_message = COALESCE(error_message, 'auto-stale: harvest window expired')
WHERE status = 'harvesting'
  AND harvest_until <= now() - interval '2 minutes';