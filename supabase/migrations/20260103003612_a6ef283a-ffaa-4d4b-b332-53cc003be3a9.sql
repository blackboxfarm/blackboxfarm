-- Add message_received_at to track when Telegram call was heard
ALTER TABLE public.telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS message_received_at TIMESTAMP WITH TIME ZONE;

-- Add ATH tracking columns
ALTER TABLE public.telegram_fantasy_positions 
ADD COLUMN IF NOT EXISTS ath_price_usd NUMERIC,
ADD COLUMN IF NOT EXISTS ath_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ath_multiplier NUMERIC;

-- Backfill message_received_at from telegram_channel_calls
UPDATE public.telegram_fantasy_positions tfp
SET message_received_at = tcc.created_at
FROM public.telegram_channel_calls tcc
WHERE tfp.token_mint = tcc.token_mint
  AND tfp.message_received_at IS NULL;

-- Create index for 12-hour window queries
CREATE INDEX IF NOT EXISTS idx_telegram_fantasy_positions_created_at 
ON public.telegram_fantasy_positions(created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN public.telegram_fantasy_positions.message_received_at IS 'Timestamp when the original Telegram call was received';
COMMENT ON COLUMN public.telegram_fantasy_positions.ath_price_usd IS 'All-time high price in USD';
COMMENT ON COLUMN public.telegram_fantasy_positions.ath_at IS 'Timestamp when ATH was reached';
COMMENT ON COLUMN public.telegram_fantasy_positions.ath_multiplier IS 'Multiplier from entry price to ATH';