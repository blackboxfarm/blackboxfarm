-- Create wallet_metadata table for caching SNS lookups
CREATE TABLE public.wallet_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  
  -- Social handles
  twitter_handle text,
  telegram_handle text,
  discord_handle text,
  
  -- Metadata
  sns_name text,
  display_name text,
  avatar_url text,
  
  -- Tracking
  lookup_source text NOT NULL, -- 'sns_success', 'sns_no_result', 'solscan_api', 'manual'
  last_lookup_at timestamp with time zone NOT NULL DEFAULT now(),
  next_lookup_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  lookup_count integer NOT NULL DEFAULT 1,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_wallet_address CHECK (length(wallet_address) BETWEEN 32 AND 44),
  CONSTRAINT valid_lookup_source CHECK (lookup_source IN ('sns_success', 'sns_no_result', 'solscan_api', 'manual'))
);

-- Indexes for performance
CREATE INDEX idx_wallet_metadata_address ON public.wallet_metadata(wallet_address);
CREATE INDEX idx_wallet_metadata_next_lookup ON public.wallet_metadata(next_lookup_at);
CREATE INDEX idx_wallet_metadata_twitter ON public.wallet_metadata(twitter_handle) WHERE twitter_handle IS NOT NULL;

-- RLS Policies
ALTER TABLE public.wallet_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wallet metadata"
  ON public.wallet_metadata FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage wallet metadata"
  ON public.wallet_metadata FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Updated at trigger
CREATE TRIGGER update_wallet_metadata_updated_at
  BEFORE UPDATE ON public.wallet_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add platform configuration for SNS lookup settings
INSERT INTO public.platform_config (config_key, config_value, description, is_active) VALUES
  ('wallet_sns_lookup_threshold', '{"min_usd_value": 1000}'::jsonb, 'Minimum USD value to trigger SNS lookup for wallet metadata', true),
  ('wallet_sns_cache_days', '{"cache_duration_days": 30}'::jsonb, 'Days to cache wallet metadata before refresh (both success and no-result)', true)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  created_at = now();