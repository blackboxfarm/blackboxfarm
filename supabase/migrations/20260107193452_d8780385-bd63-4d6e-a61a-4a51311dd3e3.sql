-- Add KOTH and FIRST analytics opt-in columns to telegram_channel_config
ALTER TABLE public.telegram_channel_config 
ADD COLUMN IF NOT EXISTS koth_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS first_enabled boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.telegram_channel_config.koth_enabled IS 'Opt-in for King of the Hill (best win rate) analytics';
COMMENT ON COLUMN public.telegram_channel_config.first_enabled IS 'Opt-in for Whos on First (earliest caller) analytics';