-- Fix 1: Add unique constraint to token_socials_history for upsert to work
ALTER TABLE public.token_socials_history 
ADD CONSTRAINT token_socials_history_token_mint_key UNIQUE (token_mint);

-- Fix 2: Make snapshot_slot nullable in holders_intel_seen_tokens so backfill can update without it
ALTER TABLE public.holders_intel_seen_tokens 
ALTER COLUMN snapshot_slot DROP NOT NULL;