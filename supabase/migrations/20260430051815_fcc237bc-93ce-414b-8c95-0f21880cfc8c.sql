-- Purge all legacy pumpfun_watchlist autopsy candidates.
-- The new pipeline writes source_feed='pumpfun_curve_death' for >=75% lambs only.
DELETE FROM public.autopsy_candidates WHERE source_feed = 'pumpfun_watchlist';