-- Add token_image column to whale_frenzy_events if it doesn't exist
ALTER TABLE public.whale_frenzy_events 
ADD COLUMN IF NOT EXISTS token_image text;