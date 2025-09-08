-- Create a junction table for many-to-many relationship between campaigns and wallets
CREATE TABLE IF NOT EXISTS public.campaign_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.blackbox_campaigns(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, wallet_id)
);

-- Enable RLS on the junction table
ALTER TABLE public.campaign_wallets ENABLE ROW LEVEL SECURITY;

-- Migrate existing data from blackbox_wallets to campaign_wallets junction table
INSERT INTO public.campaign_wallets (campaign_id, wallet_id)
SELECT DISTINCT campaign_id, id 
FROM public.blackbox_wallets 
WHERE campaign_id IS NOT NULL
ON CONFLICT (campaign_id, wallet_id) DO NOTHING;

-- Remove the campaign_id column from blackbox_wallets since we now use the junction table
ALTER TABLE public.blackbox_wallets DROP COLUMN IF EXISTS campaign_id;

-- Add trigger for updated_at if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_campaign_wallets_updated_at'
    ) THEN
        CREATE TRIGGER update_campaign_wallets_updated_at
        BEFORE UPDATE ON public.campaign_wallets
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;