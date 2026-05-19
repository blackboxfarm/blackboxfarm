UPDATE public.telegram_channel_config
SET is_active = false, updated_at = now()
WHERE channel_id = '-1003694579312';