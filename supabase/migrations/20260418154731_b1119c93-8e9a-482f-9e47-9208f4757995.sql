UPDATE public.telegram_channel_config
SET fantasy_mode = false,
    scalp_test_mode = false,
    flipit_enabled = true,
    flipit_buy_amount_sol = 0.1,
    flipit_sell_multiplier = 2,
    flipit_first_time_only = true,
    is_active = true,
    updated_at = now()
WHERE channel_id = '-1002486747312';