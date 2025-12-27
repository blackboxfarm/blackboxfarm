-- Add loop mode column for rebuy positions
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS rebuy_loop_enabled BOOLEAN DEFAULT false;