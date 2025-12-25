-- Add channel_username to telegram_channel_config for public channel scraping
ALTER TABLE public.telegram_channel_config 
ADD COLUMN IF NOT EXISTS channel_username TEXT;