-- Create pumpfun_neutrallist table for tracking neutral/unknown dev ratings
CREATE TABLE public.pumpfun_neutrallist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type TEXT NOT NULL,
  identifier TEXT NOT NULL,
  linked_token_mints TEXT[] DEFAULT '{}',
  linked_wallets TEXT[] DEFAULT '{}',
  linked_twitter TEXT[] DEFAULT '{}',
  linked_telegram TEXT[] DEFAULT '{}',
  linked_pumpfun_accounts TEXT[] DEFAULT '{}',
  linked_bags_accounts TEXT[] DEFAULT '{}',
  linked_websites TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  reason TEXT,
  source TEXT DEFAULT 'flipit',
  added_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_type, identifier)
);

-- Enable RLS
ALTER TABLE public.pumpfun_neutrallist ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view neutrallist"
  ON public.pumpfun_neutrallist
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert neutrallist"
  ON public.pumpfun_neutrallist
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update neutrallist"
  ON public.pumpfun_neutrallist
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete neutrallist"
  ON public.pumpfun_neutrallist
  FOR DELETE
  TO authenticated
  USING (true);

-- Add dev_trust_rating column to flip_positions
ALTER TABLE public.flip_positions 
ADD COLUMN IF NOT EXISTS dev_trust_rating TEXT DEFAULT 'unknown';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pumpfun_neutrallist_entry_type ON public.pumpfun_neutrallist(entry_type);
CREATE INDEX IF NOT EXISTS idx_pumpfun_neutrallist_identifier ON public.pumpfun_neutrallist(identifier);
CREATE INDEX IF NOT EXISTS idx_flip_positions_dev_trust_rating ON public.flip_positions(dev_trust_rating);