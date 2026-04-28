-- Atomic claim function for insiders creator backfill.
-- Uses FOR UPDATE SKIP LOCKED to allow parallel workers to grab disjoint rows.
CREATE OR REPLACE FUNCTION public.claim_insiders_creator_backfill_batch(
  p_batch_size int DEFAULT 25,
  p_retry_cooldown_hours int DEFAULT 24,
  p_unresolvable_cooldown_days int DEFAULT 7
)
RETURNS TABLE (
  id uuid,
  token_mint text,
  token_symbol text,
  creator_attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cooldown timestamptz := now() - make_interval(hours => p_retry_cooldown_hours);
  v_unres_cooldown timestamptz := now() - make_interval(days => p_unresolvable_cooldown_days);
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT t.id
    FROM public.telegram_insider_token_lifecycle t
    WHERE t.creator_wallet IS NULL
      AND (
        t.creator_last_attempt_at IS NULL
        OR (COALESCE(t.creator_status,'unknown') = 'unknown' AND t.creator_last_attempt_at < v_cooldown)
        OR (t.creator_status = 'unresolvable' AND t.creator_last_attempt_at < v_unres_cooldown)
      )
      AND COALESCE(t.creator_status,'unknown') <> 'resolving'
    ORDER BY t.first_called_at DESC NULLS LAST
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.telegram_insider_token_lifecycle t
     SET creator_status = 'resolving',
         creator_last_attempt_at = now()
   FROM picked
   WHERE t.id = picked.id
   RETURNING t.id, t.token_mint, t.token_symbol, COALESCE(t.creator_attempts,0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_insiders_creator_backfill_batch(int,int,int) TO service_role;