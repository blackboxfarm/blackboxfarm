-- Add campaign_id column to blackbox_wallets table
ALTER TABLE public.blackbox_wallets 
ADD COLUMN campaign_id UUID REFERENCES public.blackbox_campaigns(id) ON DELETE CASCADE;

-- Create an index for better performance
CREATE INDEX idx_blackbox_wallets_campaign_id ON public.blackbox_wallets(campaign_id);