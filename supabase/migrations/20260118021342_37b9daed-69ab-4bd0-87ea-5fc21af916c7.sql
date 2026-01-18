-- Add block_tokens_with_tax column to flipit_settings
ALTER TABLE public.flipit_settings
ADD COLUMN IF NOT EXISTS block_tokens_with_tax boolean DEFAULT true;