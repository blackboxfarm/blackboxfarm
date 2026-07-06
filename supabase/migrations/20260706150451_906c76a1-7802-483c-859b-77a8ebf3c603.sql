ALTER TABLE public.token_health_snapshots
  ADD COLUMN IF NOT EXISTS whales_pct numeric,
  ADD COLUMN IF NOT EXISTS whales_supply_pct numeric,
  ADD COLUMN IF NOT EXISTS serious_pct numeric,
  ADD COLUMN IF NOT EXISTS retail_pct numeric,
  ADD COLUMN IF NOT EXISTS top10_supply_pct numeric,
  ADD COLUMN IF NOT EXISTS fdv_usd numeric,
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS ath_mcap_usd numeric;