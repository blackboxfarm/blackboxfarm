UPDATE public.telegram_channel_config
SET is_active = false,
    flipit_enabled = false
WHERE flipit_enabled = true OR is_active = true;