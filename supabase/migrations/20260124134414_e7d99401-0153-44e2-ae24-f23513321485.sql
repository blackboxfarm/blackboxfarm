-- Add times_posted counter to track how many times we've tweeted about a token
ALTER TABLE public.holders_intel_seen_tokens 
ADD COLUMN IF NOT EXISTS times_posted integer DEFAULT 0;