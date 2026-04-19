-- Graduation sell execution speed: global defaults + per-position overrides

-- Global defaults on flipit_settings
ALTER TABLE public.flipit_settings
  ADD COLUMN IF NOT EXISTS graduation_sell_priority_fee_mode_default text NOT NULL DEFAULT 'turbo',
  ADD COLUMN IF NOT EXISTS graduation_sell_priority_fee_micro_lamports_default integer,
  ADD COLUMN IF NOT EXISTS graduation_sell_jito_tip_lamports_default integer NOT NULL DEFAULT 1000000;

-- Per-position overrides on flip_positions (nullable = fall back to global)
ALTER TABLE public.flip_positions
  ADD COLUMN IF NOT EXISTS graduation_sell_priority_fee_mode text,
  ADD COLUMN IF NOT EXISTS graduation_sell_priority_fee_micro_lamports integer,
  ADD COLUMN IF NOT EXISTS graduation_sell_jito_tip_lamports integer;