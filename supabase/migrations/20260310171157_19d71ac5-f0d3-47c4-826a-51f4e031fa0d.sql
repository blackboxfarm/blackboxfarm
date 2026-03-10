
-- Proven Dev Tokens: tier-tracked tokens that reached 400k+ mcap
CREATE TABLE public.proven_dev_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL UNIQUE,
  symbol text,
  name text,
  dev_wallet text,
  tier integer NOT NULL DEFAULT 1,
  market_cap_at_discovery numeric DEFAULT 0,
  market_cap_ath numeric DEFAULT 0,
  tier_1_at timestamptz,
  tier_2_at timestamptz,
  tier_3_at timestamptz,
  tier_4_at timestamptz,
  tier_5_at timestamptz,
  tier_6_at timestamptz,
  mint_timestamp timestamptz,
  bonding_timestamp timestamptz,
  ath_timestamp timestamptz,
  first_dex_boost_at timestamptz,
  snapshot_slot text,
  trigger_source text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for dev wallet lookups (find all successful tokens by a dev)
CREATE INDEX idx_proven_dev_tokens_dev_wallet ON public.proven_dev_tokens(dev_wallet);
CREATE INDEX idx_proven_dev_tokens_tier ON public.proven_dev_tokens(tier DESC);

-- KOL Registry: synced from Cloudflare worker scraping kolscan.io
CREATE TABLE public.kol_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_handle text NOT NULL UNIQUE,
  x_url text,
  display_name text,
  avatar_url text,
  followers_count integer DEFAULT 0,
  rank integer,
  score numeric DEFAULT 0,
  win_rate numeric,
  avg_multiplier numeric,
  categories text[],
  wallet_addresses text[],
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_kol_registry_rank ON public.kol_registry(rank);
CREATE INDEX idx_kol_registry_x_handle ON public.kol_registry(x_handle);

-- RLS: service role only (edge functions)
ALTER TABLE public.proven_dev_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kol_registry ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service key)
CREATE POLICY "Service role full access on proven_dev_tokens"
  ON public.proven_dev_tokens FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on kol_registry"
  ON public.kol_registry FOR ALL
  USING (true) WITH CHECK (true);
