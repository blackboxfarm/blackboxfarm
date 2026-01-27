-- ============================================
-- GRANULAR TOKEN SEARCH TRACKING SYSTEM
-- ============================================

-- 1. TOKEN SEARCH LOG - Master search record with session/IP context
CREATE TABLE public.token_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_mint TEXT NOT NULL,
  session_id TEXT,
  visitor_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  response_time_ms INTEGER,
  holder_count INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Indexes for search log
CREATE INDEX idx_token_search_log_token_mint ON public.token_search_log(token_mint);
CREATE INDEX idx_token_search_log_created_at ON public.token_search_log(created_at DESC);
CREATE INDEX idx_token_search_log_ip ON public.token_search_log(ip_address);
CREATE INDEX idx_token_search_log_session ON public.token_search_log(session_id);

-- Enable RLS
ALTER TABLE public.token_search_log ENABLE ROW LEVEL SECURITY;

-- Super admin can read all
CREATE POLICY "Super admins can read token_search_log"
  ON public.token_search_log FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Edge functions can insert (service role)
CREATE POLICY "Service role can insert token_search_log"
  ON public.token_search_log FOR INSERT
  WITH CHECK (true);


-- 2. TOKEN SEARCH RESULTS - Complete report snapshot
CREATE TABLE public.token_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID REFERENCES public.token_search_log(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  market_cap_usd NUMERIC,
  price_usd NUMERIC,
  price_source TEXT,
  total_supply NUMERIC,
  circulating_supply NUMERIC,
  health_score INTEGER,
  health_grade TEXT,
  tier_dust INTEGER,
  tier_retail INTEGER,
  tier_serious INTEGER,
  tier_whale INTEGER,
  lp_count INTEGER,
  lp_percentage NUMERIC,
  top5_concentration NUMERIC,
  top10_concentration NUMERIC,
  top20_concentration NUMERIC,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  bundled_percentage NUMERIC,
  launchpad TEXT,
  creator_wallet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for search results
CREATE INDEX idx_token_search_results_token_mint ON public.token_search_results(token_mint);
CREATE INDEX idx_token_search_results_created_at ON public.token_search_results(created_at DESC);
CREATE INDEX idx_token_search_results_search_id ON public.token_search_results(search_id);

-- Enable RLS
ALTER TABLE public.token_search_results ENABLE ROW LEVEL SECURITY;

-- Super admin can read all
CREATE POLICY "Super admins can read token_search_results"
  ON public.token_search_results FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Edge functions can insert
CREATE POLICY "Service role can insert token_search_results"
  ON public.token_search_results FOR INSERT
  WITH CHECK (true);


-- 3. TOKEN SOCIALS HISTORY - Track social link changes
CREATE TABLE public.token_socials_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  twitter TEXT,
  telegram TEXT,
  website TEXT,
  discord TEXT,
  source TEXT DEFAULT 'dexscreener'
);

-- Indexes
CREATE INDEX idx_token_socials_history_token_mint ON public.token_socials_history(token_mint);
CREATE INDEX idx_token_socials_history_captured_at ON public.token_socials_history(captured_at DESC);

-- Unique constraint to prevent duplicate entries (same token + same socials)
CREATE UNIQUE INDEX idx_token_socials_unique 
  ON public.token_socials_history(token_mint, COALESCE(twitter, ''), COALESCE(telegram, ''), COALESCE(website, ''), COALESCE(discord, ''));

-- Enable RLS
ALTER TABLE public.token_socials_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read token_socials_history"
  ON public.token_socials_history FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Service role can insert token_socials_history"
  ON public.token_socials_history FOR INSERT
  WITH CHECK (true);


-- 4. TOKEN DEX STATUS HISTORY - Track paid profile/CTO/boost changes
CREATE TABLE public.token_dex_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_paid_profile BOOLEAN DEFAULT false,
  has_cto BOOLEAN DEFAULT false,
  active_boosts INTEGER DEFAULT 0,
  boost_amount_total INTEGER DEFAULT 0,
  has_active_ads BOOLEAN DEFAULT false,
  orders JSONB
);

-- Indexes
CREATE INDEX idx_token_dex_status_token_mint ON public.token_dex_status_history(token_mint);
CREATE INDEX idx_token_dex_status_captured_at ON public.token_dex_status_history(captured_at DESC);

-- Unique constraint to prevent duplicate status entries
CREATE UNIQUE INDEX idx_token_dex_status_unique 
  ON public.token_dex_status_history(token_mint, has_paid_profile, has_cto, active_boosts, has_active_ads);

-- Enable RLS
ALTER TABLE public.token_dex_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read token_dex_status_history"
  ON public.token_dex_status_history FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Service role can insert token_dex_status_history"
  ON public.token_dex_status_history FOR INSERT
  WITH CHECK (true);


-- 5. TOKEN PRICE HISTORY - Time series for price tracking
CREATE TABLE public.token_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_usd NUMERIC,
  market_cap_usd NUMERIC,
  source TEXT
);

-- Indexes
CREATE INDEX idx_token_price_history_token_mint ON public.token_price_history(token_mint);
CREATE INDEX idx_token_price_history_captured_at ON public.token_price_history(captured_at DESC);
CREATE INDEX idx_token_price_history_composite ON public.token_price_history(token_mint, captured_at DESC);

-- Enable RLS
ALTER TABLE public.token_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read token_price_history"
  ON public.token_price_history FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Service role can insert token_price_history"
  ON public.token_price_history FOR INSERT
  WITH CHECK (true);


-- ============================================
-- RPC FUNCTIONS FOR DASHBOARD QUERIES
-- ============================================

-- Get token search analytics
CREATE OR REPLACE FUNCTION public.get_token_search_analytics(
  p_start_date TIMESTAMPTZ DEFAULT (now() - interval '7 days'),
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  total_searches BIGINT,
  unique_tokens BIGINT,
  unique_sessions BIGINT,
  unique_ips BIGINT,
  avg_response_time_ms NUMERIC,
  success_rate NUMERIC,
  searches_by_day JSONB,
  top_tokens JSONB,
  top_ips JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Super admin required';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT * FROM token_search_log
    WHERE created_at BETWEEN p_start_date AND p_end_date
  ),
  stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT token_mint) as tokens,
      COUNT(DISTINCT session_id) as sessions,
      COUNT(DISTINCT ip_address) as ips,
      ROUND(AVG(response_time_ms)::NUMERIC, 0) as avg_time,
      ROUND((COUNT(*) FILTER (WHERE success = true)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 1) as success_pct
    FROM filtered
  ),
  by_day AS (
    SELECT jsonb_object_agg(
      day::text,
      count
    ) as data
    FROM (
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM filtered
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    ) t
  ),
  top_tkns AS (
    SELECT jsonb_agg(
      jsonb_build_object('token_mint', token_mint, 'searches', searches)
      ORDER BY searches DESC
    ) as data
    FROM (
      SELECT token_mint, COUNT(*) as searches
      FROM filtered
      GROUP BY token_mint
      ORDER BY searches DESC
      LIMIT 20
    ) t
  ),
  top_ip AS (
    SELECT jsonb_agg(
      jsonb_build_object('ip', ip_address, 'searches', searches)
      ORDER BY searches DESC
    ) as data
    FROM (
      SELECT COALESCE(ip_address, 'unknown') as ip_address, COUNT(*) as searches
      FROM filtered
      GROUP BY ip_address
      ORDER BY searches DESC
      LIMIT 20
    ) t
  )
  SELECT
    s.total,
    s.tokens,
    s.sessions,
    s.ips,
    s.avg_time,
    s.success_pct,
    COALESCE(bd.data, '{}'::jsonb),
    COALESCE(tt.data, '[]'::jsonb),
    COALESCE(ti.data, '[]'::jsonb)
  FROM stats s
  CROSS JOIN by_day bd
  CROSS JOIN top_tkns tt
  CROSS JOIN top_ip ti;
END;
$$;