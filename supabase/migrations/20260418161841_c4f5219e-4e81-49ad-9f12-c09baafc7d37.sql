DELETE FROM public.telegram_channel_calls
WHERE channel_config_id = (
  SELECT id FROM public.telegram_channel_config WHERE channel_id = '-1003694579312'
);