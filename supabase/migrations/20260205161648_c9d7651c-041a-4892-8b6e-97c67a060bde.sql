-- Create token_banners table for token-specific banner ads
CREATE TABLE public.token_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_address TEXT NOT NULL UNIQUE,
  symbol TEXT,
  banner_url TEXT NOT NULL,
  link_url TEXT NOT NULL,
  x_community_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups by token_address
CREATE INDEX idx_token_banners_token_address ON public.token_banners(token_address);
CREATE INDEX idx_token_banners_active ON public.token_banners(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.token_banners ENABLE ROW LEVEL SECURITY;

-- Anyone can read active token banners (needed for the edge function)
CREATE POLICY "Anyone can view active token banners"
ON public.token_banners
FOR SELECT
USING (is_active = true);

-- Only super_admins can manage token banners
CREATE POLICY "Super admins can manage token banners"
ON public.token_banners
FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_token_banners_updated_at
BEFORE UPDATE ON public.token_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();