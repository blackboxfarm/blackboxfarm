-- Remove the newer duplicates to allow restoring the unique index
DELETE FROM pumpfun_watchlist WHERE id IN (
  'd557f02e-63e5-44d5-b4d8-ebd18e0d60b5',
  '941b0c05-8a3f-494f-a3ac-f2ce224472ef'
);

-- Restore the unique index
CREATE UNIQUE INDEX pumpfun_watchlist_unique_live_symbol 
ON public.pumpfun_watchlist (lower(token_symbol)) 
WHERE (token_symbol IS NOT NULL AND status = ANY (ARRAY['pending_triage','watching','qualified','buy_now','passed','active','new']));