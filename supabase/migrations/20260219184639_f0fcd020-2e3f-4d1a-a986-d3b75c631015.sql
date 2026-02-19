-- Drop the overly restrictive unique index that only allows ONE active token per ticker name.
-- This was blocking ~30% of all new tokens since pump.fun commonly has multiple
-- independent tokens sharing the same ticker (PEPE, DOGE, TRUMP, etc).
-- Other quality gates (holders, volume, momentum, market cap) handle filtering.
DROP INDEX IF EXISTS pumpfun_watchlist_unique_live_symbol;