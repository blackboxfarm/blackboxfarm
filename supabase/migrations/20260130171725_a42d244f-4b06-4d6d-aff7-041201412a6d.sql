-- Add sell_priority_fee_sol column to flip_positions for per-position gas fee persistence
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS sell_priority_fee_sol NUMERIC DEFAULT 0.0005;