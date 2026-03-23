
ALTER TABLE public.token_lifecycle 
  ADD COLUMN IF NOT EXISTS is_currently_top_200 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_top_200_rank integer;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_top_200 
  ON public.token_lifecycle (is_currently_top_200) 
  WHERE is_currently_top_200 = true;

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_overflow 
  ON public.token_lifecycle (highest_rank, last_seen_at DESC) 
  WHERE is_currently_top_200 = false AND highest_rank IS NOT NULL;
