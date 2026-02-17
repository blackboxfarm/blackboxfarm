-- Backfill price_at_discovery_usd from price_start_usd for all tokens missing it
UPDATE pumpfun_watchlist 
SET price_at_discovery_usd = price_start_usd 
WHERE price_at_discovery_usd IS NULL 
  AND price_start_usd IS NOT NULL 
  AND price_start_usd > 0;