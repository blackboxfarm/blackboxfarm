-- Add twitter_handle column to whale_wallets table
ALTER TABLE public.whale_wallets 
ADD COLUMN IF NOT EXISTS twitter_handle text;

-- Add index for twitter lookups
CREATE INDEX IF NOT EXISTS idx_whale_wallets_twitter ON public.whale_wallets(twitter_handle) WHERE twitter_handle IS NOT NULL;