-- Disable fantasy mode and remove daily cap for FlipIt insiders auto-buy
UPDATE public.telegram_channel_config
SET fantasy_mode = false
WHERE channel_id = '-1003694579312';

-- Raise global daily position cap to effectively unlimited
UPDATE public.flipit_global_config
SET default_max_daily_positions = 9999;