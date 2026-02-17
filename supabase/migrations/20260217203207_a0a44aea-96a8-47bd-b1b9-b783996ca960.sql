-- Add post_exit_outcome column for win classification
ALTER TABLE public.pumpfun_fantasy_positions 
ADD COLUMN IF NOT EXISTS post_exit_outcome text;