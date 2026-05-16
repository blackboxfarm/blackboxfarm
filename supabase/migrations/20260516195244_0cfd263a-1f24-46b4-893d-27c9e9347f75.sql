
ALTER TABLE public.holders_intel_dex_triggers
  DROP CONSTRAINT IF EXISTS holders_intel_dex_triggers_queue_id_fkey,
  ADD CONSTRAINT holders_intel_dex_triggers_queue_id_fkey
    FOREIGN KEY (queue_id) REFERENCES public.holders_intel_post_queue(id) ON DELETE SET NULL;

ALTER TABLE public.holders_intel_surge_alerts
  DROP CONSTRAINT IF EXISTS holders_intel_surge_alerts_queue_id_fkey,
  ADD CONSTRAINT holders_intel_surge_alerts_queue_id_fkey
    FOREIGN KEY (queue_id) REFERENCES public.holders_intel_post_queue(id) ON DELETE SET NULL;
