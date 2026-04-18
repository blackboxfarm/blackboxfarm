UPDATE public.telegram_channel_config
SET is_active = true,
    flipit_enabled = true,
    flipit_buy_amount_sol = 0.1,
    flipit_sell_multiplier = 2,
    flipit_first_time_only = true,
    scalp_test_mode = false,
    fantasy_mode = false
WHERE channel_id = '-1002486747312';