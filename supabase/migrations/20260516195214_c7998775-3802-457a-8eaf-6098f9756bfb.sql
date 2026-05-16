
CREATE TEMP TABLE _keep_archived ON COMMIT DROP AS
SELECT DISTINCT ON (token_mint) id
FROM public.holders_intel_post_queue
WHERE manual_status = 'posted_manual'
ORDER BY token_mint, manual_posted_at ASC NULLS LAST, created_at ASC;

CREATE TEMP TABLE _drop_archived ON COMMIT DROP AS
SELECT id FROM public.holders_intel_post_queue
WHERE manual_status = 'posted_manual'
  AND id NOT IN (SELECT id FROM _keep_archived);

UPDATE public.holders_intel_dex_triggers SET queue_id = NULL
WHERE queue_id IN (SELECT id FROM _drop_archived);

UPDATE public.holders_intel_surge_alerts SET queue_id = NULL
WHERE queue_id IN (SELECT id FROM _drop_archived);

DELETE FROM public.holders_intel_post_queue
WHERE id IN (SELECT id FROM _drop_archived);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_holders_intel_queue_archived_mint
  ON public.holders_intel_post_queue (token_mint)
  WHERE manual_status = 'posted_manual';
