-- Create the new flexible contract system
-- First, create a contract table that represents the execution unit
CREATE TABLE public.blackbox_contracts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for contracts
ALTER TABLE public.blackbox_contracts ENABLE ROW LEVEL SECURITY;

-- Create policy for contracts - users can only manage their own
CREATE POLICY "Users can manage their own contracts" 
ON public.blackbox_contracts 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create junction table for contract-campaign relationships (many-to-many)
CREATE TABLE public.blackbox_contract_campaigns (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES public.blackbox_contracts(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.blackbox_campaigns(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(contract_id, campaign_id)
);

-- Enable RLS for contract-campaigns
ALTER TABLE public.blackbox_contract_campaigns ENABLE ROW LEVEL SECURITY;

-- Create policy for contract-campaigns
CREATE POLICY "Users can manage their contract campaigns" 
ON public.blackbox_contract_campaigns 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.blackbox_contracts bc 
    WHERE bc.id = contract_id AND bc.user_id = auth.uid()
));

-- Create junction table for contract-wallet relationships (many-to-many)
CREATE TABLE public.blackbox_contract_wallets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES public.blackbox_contracts(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(contract_id, wallet_id)
);

-- Enable RLS for contract-wallets
ALTER TABLE public.blackbox_contract_wallets ENABLE ROW LEVEL SECURITY;

-- Create policy for contract-wallets
CREATE POLICY "Users can manage their contract wallets" 
ON public.blackbox_contract_wallets 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.blackbox_contracts bc 
    WHERE bc.id = contract_id AND bc.user_id = auth.uid()
));

-- Create junction table for contract-command relationships (many-to-many)
CREATE TABLE public.blackbox_contract_commands (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES public.blackbox_contracts(id) ON DELETE CASCADE,
    command_id UUID NOT NULL REFERENCES public.blackbox_command_codes(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.blackbox_wallets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(contract_id, command_id, wallet_id)
);

-- Enable RLS for contract-commands
ALTER TABLE public.blackbox_contract_commands ENABLE ROW LEVEL SECURITY;

-- Create policy for contract-commands
CREATE POLICY "Users can manage their contract commands" 
ON public.blackbox_contract_commands 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM public.blackbox_contracts bc 
    WHERE bc.id = contract_id AND bc.user_id = auth.uid()
));

-- Add updated_at trigger for contracts
CREATE TRIGGER update_blackbox_contracts_updated_at
BEFORE UPDATE ON public.blackbox_contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Remove the strict foreign key constraint from wallets to campaigns
-- by making campaign_id nullable (for backwards compatibility)
ALTER TABLE public.blackbox_wallets ALTER COLUMN campaign_id DROP NOT NULL;

-- Remove the strict foreign key constraint from commands to wallets
-- by making wallet_id nullable (for backwards compatibility)  
ALTER TABLE public.blackbox_command_codes ALTER COLUMN wallet_id DROP NOT NULL;