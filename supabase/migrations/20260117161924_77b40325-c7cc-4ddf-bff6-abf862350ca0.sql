-- Add columns for per-channel Twitter posting and Telegram announcement settings
ALTER TABLE public.telegram_channel_config
  ADD COLUMN IF NOT EXISTS tweet_on_fantasy_buy boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS announce_to_channel_id text DEFAULT null;

-- Add comment for documentation
COMMENT ON COLUMN public.telegram_channel_config.tweet_on_fantasy_buy IS 'If true, post to Twitter when a fantasy buy is executed from this channel';
COMMENT ON COLUMN public.telegram_channel_config.announce_to_channel_id IS 'Channel/group ID to send announcement message after fantasy buy (different from source channel)';