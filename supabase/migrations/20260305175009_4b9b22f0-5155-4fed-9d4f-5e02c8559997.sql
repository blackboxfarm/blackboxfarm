
-- Table for admin-managed X community verification codes
CREATE TABLE public.x_community_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.x_community_codes ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage codes
CREATE POLICY "Super admins can manage x_community_codes"
  ON public.x_community_codes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Log of code redemptions
CREATE TABLE public.x_community_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id UUID NOT NULL REFERENCES public.x_community_codes(id),
  x_handle TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, code_id)
);

ALTER TABLE public.x_community_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can see their own redemptions
CREATE POLICY "Users can view own redemptions"
  ON public.x_community_redemptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
