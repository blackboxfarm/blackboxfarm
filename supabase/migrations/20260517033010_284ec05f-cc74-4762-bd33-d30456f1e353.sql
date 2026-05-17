ALTER TABLE public.allstar_mint_alerts
  ADD COLUMN IF NOT EXISTS dev_balance_pct_at_alert numeric;