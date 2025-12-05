-- Create API provider configuration table
CREATE TABLE public.api_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1,
  rate_limit_remaining INTEGER,
  last_error_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_provider_config ENABLE ROW LEVEL SECURITY;

-- Allow super admins to manage providers
CREATE POLICY "Super admins can manage API providers"
ON public.api_provider_config
FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Allow authenticated users to read provider config (for edge functions)
CREATE POLICY "Authenticated users can read API providers"
ON public.api_provider_config
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Seed default providers - HELIUS DISABLED by default
INSERT INTO public.api_provider_config (provider_name, is_enabled, priority) VALUES
  ('helius', false, 1),
  ('solscan', true, 2),
  ('shyft', true, 3),
  ('public_rpc', true, 99);

-- Create updated_at trigger
CREATE TRIGGER update_api_provider_config_updated_at
BEFORE UPDATE ON public.api_provider_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();