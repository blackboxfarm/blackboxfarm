-- Add banner_url column to store Dexscreener header banners (1500x500)
ALTER TABLE public.holders_intel_seen_tokens 
ADD COLUMN IF NOT EXISTS banner_url TEXT;

COMMENT ON COLUMN public.holders_intel_seen_tokens.banner_url IS 'Dexscreener header banner URL (1500x500 wide image)';