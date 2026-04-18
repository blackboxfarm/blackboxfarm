UPDATE public.telegram_channel_config
SET scalp_test_mode = false,
    fantasy_mode = false,
    flipit_enabled = true,
    flipit_buy_amount_sol = 0.1,
    flipit_sell_multiplier = 2,
    flipit_first_time_only = true,
    is_active = true
WHERE channel_id = '-1003694579312';

UPDATE public.telegram_channel_config
SET is_active = false,
    flipit_enabled = false
WHERE channel_id = '-1002486747312';