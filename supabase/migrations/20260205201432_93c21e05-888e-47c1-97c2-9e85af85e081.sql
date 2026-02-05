-- Add mint and bonded timestamp columns to holders_intel_seen_tokens
ALTER TABLE public.holders_intel_seen_tokens 
ADD COLUMN IF NOT EXISTS minted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bonded_at TIMESTAMP WITH TIME ZONE;