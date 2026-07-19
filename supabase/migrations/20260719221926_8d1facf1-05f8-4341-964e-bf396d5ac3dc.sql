ALTER TABLE public.alpha_paper_trades
  ADD COLUMN IF NOT EXISTS live_buy_status text,
  ADD COLUMN IF NOT EXISTS live_buy_signature text,
  ADD COLUMN IF NOT EXISTS live_buy_sol numeric,
  ADD COLUMN IF NOT EXISTS live_buy_usd numeric,
  ADD COLUMN IF NOT EXISTS live_buy_error text,
  ADD COLUMN IF NOT EXISTS live_buy_at timestamptz;

ALTER TABLE public.alpha_config
  ADD COLUMN IF NOT EXISTS live_buy_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS live_buy_usd numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS live_buy_daily_cap_usd numeric NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS live_buy_wallet_id uuid,
  ADD COLUMN IF NOT EXISTS live_buy_slippage_bps int NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS live_buy_priority_fee_microlamports bigint NOT NULL DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS live_buy_jito_tip_lamports bigint NOT NULL DEFAULT 300000;

UPDATE public.alpha_config
SET live_buy_wallet_id = '2aa3f5d9-5cdb-45c7-a80b-f5b0d6c7c215'
WHERE id = 1 AND live_buy_wallet_id IS NULL;