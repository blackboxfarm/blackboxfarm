-- Update blackbox_wallets to remove campaign_id (make wallets independent)
ALTER TABLE public.blackbox_wallets DROP COLUMN IF EXISTS campaign_id;

-- Create junction table for campaign-wallet relationships
CREATE TABLE IF NOT EXISTS public.campaign_wallets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES public.blackbox_campaigns(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(campaign_id, wallet_id)
);

-- Enable RLS on campaign_wallets
ALTER TABLE public.campaign_wallets ENABLE ROW LEVEL SECURITY;

-- Create policy for campaign_wallets
CREATE POLICY "Users can manage their campaign wallets" 
ON public.campaign_wallets 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.blackbox_campaigns bc 
        WHERE bc.id = campaign_wallets.campaign_id 
        AND bc.user_id = auth.uid()
    )
);

-- Update blackbox_wallets RLS policy to allow independent wallet management
DROP POLICY IF EXISTS "Users can only access wallets from their own campaigns" ON public.blackbox_wallets;

CREATE POLICY "Users can manage their own wallets" 
ON public.blackbox_wallets 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.campaign_wallets cw
        JOIN public.blackbox_campaigns bc ON cw.campaign_id = bc.id
        WHERE cw.wallet_id = blackbox_wallets.id 
        AND bc.user_id = auth.uid()
    ) OR 
    -- Allow creating new wallets
    (TG_OP = 'INSERT' AND auth.uid() IS NOT NULL)
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.campaign_wallets cw
        JOIN public.blackbox_campaigns bc ON cw.campaign_id = bc.id
        WHERE cw.wallet_id = blackbox_wallets.id 
        AND bc.user_id = auth.uid()
    ) OR 
    -- Allow creating new wallets
    (TG_OP = 'INSERT' AND auth.uid() IS NOT NULL)
);

-- Update blackbox_command_codes RLS policy to work with new structure
DROP POLICY IF EXISTS "Users can manage command codes from their wallets" ON public.blackbox_command_codes;

CREATE POLICY "Users can manage their command codes" 
ON public.blackbox_command_codes 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.blackbox_wallets bw
        JOIN public.campaign_wallets cw ON cw.wallet_id = bw.id
        JOIN public.blackbox_campaigns bc ON bc.id = cw.campaign_id
        WHERE bw.id = blackbox_command_codes.wallet_id 
        AND bc.user_id = auth.uid()
    )
);

-- Update blackbox_transactions RLS policy to work with new structure
DROP POLICY IF EXISTS "Users can view transactions from their wallets" ON public.blackbox_transactions;

CREATE POLICY "Users can view their wallet transactions" 
ON public.blackbox_transactions 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.blackbox_wallets bw
        JOIN public.campaign_wallets cw ON cw.wallet_id = bw.id
        JOIN public.blackbox_campaigns bc ON bc.id = cw.campaign_id
        WHERE bw.id = blackbox_transactions.wallet_id 
        AND bc.user_id = auth.uid()
    )
);