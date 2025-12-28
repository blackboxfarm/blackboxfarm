-- Add social link columns to flip_positions table
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS token_image TEXT,
ADD COLUMN IF NOT EXISTS twitter_url TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS telegram_url TEXT;