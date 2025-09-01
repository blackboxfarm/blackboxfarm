-- Create super_admin_wallets table for platform management
CREATE TABLE public.super_admin_wallets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT NOT NULL,
    pubkey TEXT NOT NULL UNIQUE,
    secret_key_encrypted TEXT NOT NULL,
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('treasury', 'campaign_funding', 'refund_processing', 'emergency')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.super_admin_wallets ENABLE ROW LEVEL SECURITY;

-- Create policy for super admin access only (service role for now)
CREATE POLICY "Super admin wallets access" 
ON public.super_admin_wallets 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create trigger for automatic encryption of secret keys
CREATE TRIGGER encrypt_super_admin_wallet_secrets
    BEFORE INSERT OR UPDATE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_wallet_secret();

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_super_admin_wallets_updated_at
    BEFORE UPDATE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for wallet type lookups
CREATE INDEX idx_super_admin_wallets_type ON public.super_admin_wallets(wallet_type, is_active);
CREATE INDEX idx_super_admin_wallets_active ON public.super_admin_wallets(is_active, created_at);

-- Create function to get active wallet by type
CREATE OR REPLACE FUNCTION public.get_active_super_admin_wallet(wallet_type_param text)
RETURNS TABLE(id UUID, label TEXT, pubkey TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT saw.id, saw.label, saw.pubkey
    FROM public.super_admin_wallets saw
    WHERE saw.wallet_type = wallet_type_param
    AND saw.is_active = true
    ORDER BY saw.created_at DESC
    LIMIT 1;
END;
$$;