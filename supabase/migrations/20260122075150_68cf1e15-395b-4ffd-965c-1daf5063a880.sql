-- Add columns for raw token quantity (as string for BigInt) and decimals
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS quantity_tokens_raw TEXT,
ADD COLUMN IF NOT EXISTS token_decimals INTEGER;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.flip_positions.quantity_tokens_raw IS 'Raw token amount as string to preserve BigInt precision for on-chain operations';
COMMENT ON COLUMN public.flip_positions.token_decimals IS 'Token decimal places for converting between raw and display amounts';