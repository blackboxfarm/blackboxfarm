
ALTER TABLE public.alpha_config
  ADD COLUMN IF NOT EXISTS live_buy_sol_fixed numeric NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS live_buy_min_sol_reserve numeric NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS live_sell_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.alpha_paper_trades
  ADD COLUMN IF NOT EXISTS flip_position_id uuid,
  ADD COLUMN IF NOT EXISTS live_sell_status text,
  ADD COLUMN IF NOT EXISTS live_sell_signature text,
  ADD COLUMN IF NOT EXISTS live_sell_sol numeric,
  ADD COLUMN IF NOT EXISTS live_sell_usd numeric,
  ADD COLUMN IF NOT EXISTS live_sell_error text,
  ADD COLUMN IF NOT EXISTS live_sell_at timestamptz;
