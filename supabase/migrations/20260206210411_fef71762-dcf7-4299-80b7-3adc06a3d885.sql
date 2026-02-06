-- Add paid_composite_url column to holders_intel_seen_tokens for storing AI-generated composite images
ALTER TABLE public.holders_intel_seen_tokens 
ADD COLUMN IF NOT EXISTS paid_composite_url TEXT;