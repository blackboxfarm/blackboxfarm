UPDATE public.telegram_channel_config
SET is_active = false,
    flipit_enabled = false
WHERE is_active = true OR flipit_enabled = true;