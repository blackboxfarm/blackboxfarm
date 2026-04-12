-- One-time prune of dead noise from pumpfun_watchlist
-- Only deletes rows that are dead/rejected, low value, old, and never attempted to buy
DELETE FROM public.pumpfun_watchlist
WHERE status IN ('dead', 'rejected')
  AND (market_cap_usd IS NULL OR market_cap_usd < 100)
  AND created_at < NOW() - INTERVAL '7 days'
  AND buy_attempted_at IS NULL;