ALTER TABLE public.pumpfun_fantasy_positions 
ADD COLUMN IF NOT EXISTS entry_flags jsonb DEFAULT NULL;