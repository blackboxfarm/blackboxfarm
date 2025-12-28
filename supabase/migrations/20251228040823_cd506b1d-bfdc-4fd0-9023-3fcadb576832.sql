-- Add sogjews Telegram channel tracker (channel_id is placeholder since we use public scraping)
INSERT INTO telegram_channel_config (
  channel_id,
  channel_name,
  channel_username,
  is_active,
  fantasy_mode,
  fantasy_buy_amount_usd,
  ape_keyword_enabled,
  max_mint_age_minutes
) VALUES (
  'sogjews',
  'SOG Jews',
  'sogjews',
  true,
  true,
  100,
  true,
  60
);