-- Add Graduation Sell columns to flip_positions
-- Captures the post-bonding-curve graduation spike on Raydium

ALTER TABLE public.flip_positions
  ADD COLUMN IF NOT EXISTS graduation_sell_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS graduation_sell_trigger_pct numeric NOT NULL DEFAULT 99.9,
  ADD COLUMN IF NOT EXISTS graduation_sell_max_capture_pct numeric NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS graduation_sell_min_capture_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS graduation_sell_trail_drop_pct numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS graduation_sell_slippage_bps integer NOT NULL DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS graduation_sell_status text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS graduation_sell_armed_at timestamptz,
  ADD COLUMN IF NOT EXISTS graduation_sell_arming_price_usd numeric,
  ADD COLUMN IF NOT EXISTS graduation_sell_peak_price_usd numeric,
  ADD COLUMN IF NOT EXISTS graduation_sell_executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS graduation_sell_last_eval_at timestamptz;

-- Ensure status is one of the allowed values
ALTER TABLE public.flip_positions
  DROP CONSTRAINT IF EXISTS flip_positions_graduation_sell_status_check;
ALTER TABLE public.flip_positions
  ADD CONSTRAINT flip_positions_graduation_sell_status_check
  CHECK (graduation_sell_status IN ('disabled','armed_pre_grad','watching_post_grad','executed','failed'));

-- Index for monitor scans (only active states)
CREATE INDEX IF NOT EXISTS idx_flip_positions_graduation_active
  ON public.flip_positions (graduation_sell_status)
  WHERE graduation_sell_enabled = true
    AND graduation_sell_status IN ('disabled','armed_pre_grad','watching_post_grad');