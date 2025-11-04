-- Ensure scraped_tokens table exists with proper structure
CREATE TABLE IF NOT EXISTS public.scraped_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL UNIQUE,
  symbol text,
  name text,
  discovery_source text DEFAULT 'html_scrape',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can manage scraped tokens" ON scraped_tokens;

-- Create policy allowing service role and super admins to manage
CREATE POLICY "Super admins can manage scraped tokens"
ON public.scraped_tokens
FOR ALL
USING (
  is_super_admin(auth.uid()) OR 
  (auth.jwt() ->> 'role'::text) = 'service_role'::text
)
WITH CHECK (
  is_super_admin(auth.uid()) OR 
  (auth.jwt() ->> 'role'::text) = 'service_role'::text
);