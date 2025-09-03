-- Create token metadata storage table
CREATE TABLE public.token_metadata (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mint_address TEXT NOT NULL UNIQUE,
    name TEXT,
    symbol TEXT,
    decimals INTEGER DEFAULT 9,
    logo_uri TEXT,
    description TEXT,
    total_supply NUMERIC,
    verified BOOLEAN DEFAULT false,
    mint_authority TEXT,
    freeze_authority TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.token_metadata ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (token metadata is public)
CREATE POLICY "Token metadata is publicly readable" 
ON public.token_metadata 
FOR SELECT 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_token_metadata_updated_at
BEFORE UPDATE ON public.token_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_token_metadata_mint_address ON public.token_metadata(mint_address);