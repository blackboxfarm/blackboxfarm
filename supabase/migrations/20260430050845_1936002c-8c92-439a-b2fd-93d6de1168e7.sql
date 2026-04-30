
-- Add bonding_curve_pct to autopsy_candidates so the queue UI can display & sort by it
ALTER TABLE public.autopsy_candidates
  ADD COLUMN IF NOT EXISTS bonding_curve_pct numeric;

-- One-time cleanup: drop legacy candidates from the old 'pumpfun_watchlist' source feed
-- where the underlying token is below the 75% curve gate or has NULL curve data.
-- Curve deaths will be re-populated by the next funnel run with source_feed='pumpfun_curve_death'.
DELETE FROM public.autopsy_candidates ac
USING public.pumpfun_watchlist pw
WHERE ac.source_feed = 'pumpfun_watchlist'
  AND ac.token_mint = pw.token_mint
  AND (pw.bonding_curve_pct IS NULL OR pw.bonding_curve_pct < 75);

-- Also drop pumpfun_watchlist-sourced candidates whose mint is no longer in the
-- watchlist at all (orphaned old rows).
DELETE FROM public.autopsy_candidates
WHERE source_feed = 'pumpfun_watchlist'
  AND token_mint NOT IN (SELECT token_mint FROM public.pumpfun_watchlist WHERE token_mint IS NOT NULL);
