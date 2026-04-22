
ALTER TABLE public.telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS dev_history_warning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mesh_decision_trace jsonb;

UPDATE public.telegram_insider_token_lifecycle til
SET
  mesh_promotion_status = 'not_eligible',
  dev_history_warning = true,
  is_rugged = false,
  mesh_promotion_reason = COALESCE(mesh_promotion_reason, '') || ' [reclassified: dev history only, this token clean]'
WHERE til.mesh_promotion_status = 'rejected_rug'
  AND NOT EXISTS (
    SELECT 1
    FROM public.token_lifecycle tl
    WHERE tl.token_mint = til.token_mint
      AND tl.death_cause IN ('rug_pull','lp_pulled','scam','rug')
  );
