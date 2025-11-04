-- Create scraped_tokens table for HTML scrape data
CREATE TABLE IF NOT EXISTS public.scraped_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL UNIQUE,
  symbol TEXT,
  name TEXT,
  creator_wallet TEXT,
  discovery_source TEXT NOT NULL DEFAULT 'html_scrape',
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_tokens ENABLE ROW LEVEL SECURITY;

-- Super admins can manage scraped tokens
CREATE POLICY "Super admins can manage scraped tokens"
ON public.scraped_tokens
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_mint ON public.scraped_tokens(token_mint);
CREATE INDEX IF NOT EXISTS idx_scraped_tokens_source ON public.scraped_tokens(discovery_source);