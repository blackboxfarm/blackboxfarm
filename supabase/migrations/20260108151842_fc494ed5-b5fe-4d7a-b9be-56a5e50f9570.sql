-- Add FlipIt moonbag configuration columns to telegram_channel_config
ALTER TABLE telegram_channel_config
ADD COLUMN IF NOT EXISTS flipit_moonbag_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS flipit_moonbag_sell_pct numeric DEFAULT 90,
ADD COLUMN IF NOT EXISTS flipit_moonbag_keep_pct numeric DEFAULT 10;

-- Add comment for documentation
COMMENT ON COLUMN telegram_channel_config.flipit_moonbag_enabled IS 'Enable moonbag for FlipIt live buys - keeps a percentage after target hit';
COMMENT ON COLUMN telegram_channel_config.flipit_moonbag_sell_pct IS 'Percentage to sell when target is hit (default 90%)';
COMMENT ON COLUMN telegram_channel_config.flipit_moonbag_keep_pct IS 'Percentage to keep as moonbag (default 10%)';