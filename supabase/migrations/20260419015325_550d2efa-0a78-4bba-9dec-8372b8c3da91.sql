-- Moonbag support on per-position
ALTER TABLE public.flip_positions
  ADD COLUMN IF NOT EXISTS graduation_sell_moonbag_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS graduation_sell_sold_pct numeric,
  ADD COLUMN IF NOT EXISTS graduation_sell_moonbag_qty_tokens numeric,
  ADD COLUMN IF NOT EXISTS position_group_id uuid;

-- Index for group lookups
CREATE INDEX IF NOT EXISTS idx_flip_positions_group_id
  ON public.flip_positions (position_group_id)
  WHERE position_group_id IS NOT NULL;

-- Sanity bounds for moonbag %
ALTER TABLE public.flip_positions
  DROP CONSTRAINT IF EXISTS flip_positions_grad_moonbag_pct_chk;
ALTER TABLE public.flip_positions
  ADD CONSTRAINT flip_positions_grad_moonbag_pct_chk
  CHECK (graduation_sell_moonbag_pct >= 0 AND graduation_sell_moonbag_pct <= 50);

-- Global default on flipit_settings
ALTER TABLE public.flipit_settings
  ADD COLUMN IF NOT EXISTS graduation_sell_moonbag_pct_default numeric NOT NULL DEFAULT 0;

ALTER TABLE public.flipit_settings
  DROP CONSTRAINT IF EXISTS flipit_settings_grad_moonbag_pct_default_chk;
ALTER TABLE public.flipit_settings
  ADD CONSTRAINT flipit_settings_grad_moonbag_pct_default_chk
  CHECK (graduation_sell_moonbag_pct_default >= 0 AND graduation_sell_moonbag_pct_default <= 50);