-- Create table for user-managed rent reclaimer wallets
CREATE TABLE public.rent_reclaimer_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pubkey TEXT NOT NULL UNIQUE,
  secret_key_encrypted TEXT NOT NULL,
  nickname TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add comment
COMMENT ON TABLE public.rent_reclaimer_wallets IS 'User-imported wallets for token account rent reclaiming';

-- Enable RLS
ALTER TABLE public.rent_reclaimer_wallets ENABLE ROW LEVEL SECURITY;

-- Super admin only policies
CREATE POLICY "Super admins can view rent_reclaimer_wallets"
  ON public.rent_reclaimer_wallets
  FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert rent_reclaimer_wallets"
  ON public.rent_reclaimer_wallets
  FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update rent_reclaimer_wallets"
  ON public.rent_reclaimer_wallets
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete rent_reclaimer_wallets"
  ON public.rent_reclaimer_wallets
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_rent_reclaimer_wallets_updated_at
  BEFORE UPDATE ON public.rent_reclaimer_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();