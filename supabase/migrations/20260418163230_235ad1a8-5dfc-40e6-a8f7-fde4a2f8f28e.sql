ALTER TABLE public.telegram_channel_calls
  DROP CONSTRAINT telegram_channel_calls_channel_config_id_fkey,
  ADD CONSTRAINT telegram_channel_calls_channel_config_id_fkey
    FOREIGN KEY (channel_config_id) REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE;

ALTER TABLE public.telegram_whale_stats
  DROP CONSTRAINT telegram_whale_stats_channel_config_id_fkey,
  ADD CONSTRAINT telegram_whale_stats_channel_config_id_fkey
    FOREIGN KEY (channel_config_id) REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE;