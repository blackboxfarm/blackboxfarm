-- Create alert config for the actual whale owner
INSERT INTO mega_whale_alert_config (
  user_id,
  notify_email,
  notify_telegram,
  notify_browser,
  email_address,
  telegram_chat_id,
  auto_buy_on_mint,
  auto_buy_amount_sol,
  auto_buy_wait_for_buys,
  auto_buy_max_wait_minutes
) VALUES (
  '1b97e951-2f2d-46eb-a183-de7fb75c12f0',
  true,
  true,
  true,
  'wilsondavid@live.ca',
  '7045582884',
  true,
  0.1,
  5,
  10
) ON CONFLICT (user_id) DO UPDATE SET
  notify_email = true,
  notify_telegram = true,
  email_address = 'wilsondavid@live.ca',
  telegram_chat_id = '7045582884';