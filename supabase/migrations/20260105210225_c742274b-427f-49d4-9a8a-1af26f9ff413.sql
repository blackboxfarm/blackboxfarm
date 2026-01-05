-- 1) Clean up existing live-queue duplicates (so we can add a uniqueness guarantee)
WITH ranked AS (
  SELECT
    id,
    token_mint,
    token_symbol,
    row_number() OVER (
      PARTITION BY lower(token_symbol)
      ORDER BY created_at ASC
    ) AS rn
  FROM public.pumpfun_watchlist
  WHERE token_symbol IS NOT NULL
    AND status = ANY (ARRAY['pending_triage','watching','qualified','buy_now','passed','active','new'])
)
UPDATE public.pumpfun_watchlist w
SET
  status = 'rejected',
  permanent_reject = true,
  rejection_type = COALESCE(w.rejection_type, 'permanent'),
  rejection_reason = COALESCE(w.rejection_reason, 'duplicate_ticker:db_cleanup'),
  rejection_reasons = COALESCE(w.rejection_reasons, '{}'::text[]) || ARRAY['duplicate_ticker','db_cleanup']::text[],
  removal_reason = COALESCE(w.removal_reason, 'Duplicate ticker blocked (DB cleanup)'),
  updated_at = now()
FROM ranked r
WHERE w.id = r.id
  AND r.rn > 1;

-- 2) Enforce: only ONE live token per ticker (case-insensitive)
-- This prevents race conditions where multiple same-ticker tokens arrive at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS pumpfun_watchlist_unique_live_symbol
ON public.pumpfun_watchlist (lower(token_symbol))
WHERE token_symbol IS NOT NULL
  AND status = ANY (ARRAY['pending_triage','watching','qualified','buy_now','passed','active','new']);
