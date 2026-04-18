UPDATE public.telegram_channel_config
SET is_active = (channel_username = '-1003694579312'),
    flipit_enabled = (channel_username = '-1003694579312'),
    flipit_buy_amount_sol = 0.1,
    flipit_sell_multiplier = 2,
    flipit_first_time_only = true,
    scalp_test_mode = false,
    fantasy_mode = false
WHERE channel_username = '-1003694579312'
   OR is_active = true
   OR flipit_enabled = true;