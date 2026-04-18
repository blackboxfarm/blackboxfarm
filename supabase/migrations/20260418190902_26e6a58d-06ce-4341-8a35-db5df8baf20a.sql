ALTER TABLE public.flip_positions
ADD COLUMN IF NOT EXISTS flipit_moonbag_sell_pct numeric;

COMMENT ON COLUMN public.flip_positions.flipit_moonbag_sell_pct IS 'Percentage of position to sell when target multiplier hit (rest kept as moonbag). Mirrors telegram_channel_config.flipit_moonbag_sell_pct at buy time.';