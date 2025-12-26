-- Add verification_type column to twitter_accounts
ALTER TABLE public.twitter_accounts 
ADD COLUMN verification_type TEXT DEFAULT 'none';

-- Update existing rows - convert is_verified boolean to verification_type
UPDATE public.twitter_accounts 
SET verification_type = CASE WHEN is_verified = true THEN 'blue' ELSE 'none' END;

-- Drop the old is_verified column
ALTER TABLE public.twitter_accounts DROP COLUMN is_verified;