ALTER TABLE public.telegram_channel_config 
ADD COLUMN IF NOT EXISTS flipit_first_time_only BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_flip_positions_source_channel_token 
ON public.flip_positions (source_channel_id, token_mint) 
WHERE source = 'telegram';