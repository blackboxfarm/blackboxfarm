-- Add BAGS.FM and PUMP.fun profile fields to twitter_accounts
ALTER TABLE public.twitter_accounts 
ADD COLUMN IF NOT EXISTS bags_fm_url text,
ADD COLUMN IF NOT EXISTS bags_fm_wallet text,
ADD COLUMN IF NOT EXISTS pump_fun_url text,
ADD COLUMN IF NOT EXISTS pump_fun_wallet text;