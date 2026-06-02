ALTER TABLE public.blackbox_aggregator_runs DROP CONSTRAINT IF EXISTS blackbox_aggregator_runs_status_check;
ALTER TABLE public.blackbox_aggregator_runs ADD CONSTRAINT blackbox_aggregator_runs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'posted'::text, 'harvesting'::text, 'composing'::text, 'published'::text, 'failed'::text, 'skipped'::text, 'handed_off'::text, 'stale'::text]));