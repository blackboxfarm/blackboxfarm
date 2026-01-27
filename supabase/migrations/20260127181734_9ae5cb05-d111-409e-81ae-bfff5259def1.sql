-- Add image_uri column to holders_intel_seen_tokens for token images
ALTER TABLE public.holders_intel_seen_tokens 
ADD COLUMN IF NOT EXISTS image_uri TEXT;