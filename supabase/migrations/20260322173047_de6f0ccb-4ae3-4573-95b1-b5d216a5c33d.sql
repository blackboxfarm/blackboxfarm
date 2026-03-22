
-- ============================================
-- Wallet Family Surveillance Engine — 6 Tables
-- ============================================

-- 1. wallet_families — Family clusters
CREATE TABLE public.wallet_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_wallet TEXT NOT NULL,
  family_name TEXT,
  total_wallets INTEGER NOT NULL DEFAULT 0,
  risk_score NUMERIC DEFAULT 0,
  total_mints_detected INTEGER NOT NULL DEFAULT 0,
  last_rescored_at TIMESTAMPTZ,
  allstar_id UUID REFERENCES public.allstar_dev_registry(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_wallet_families_seed ON public.wallet_families(seed_wallet);

-- 2. wallet_family_members — Individual wallets within a family
CREATE TABLE public.wallet_family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.wallet_families(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'unknown' CHECK (label IN ('seed','parent','sibling','child','cex_gateway','unknown')),
  tier TEXT NOT NULL DEFAULT 'C' CHECK (tier IN ('A','B','C','X')),
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','excluded')),
  last_signature TEXT,
  last_polled_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_wfm_family_wallet ON public.wallet_family_members(family_id, wallet_address);
CREATE INDEX idx_wfm_wallet ON public.wallet_family_members(wallet_address);

-- 3. wallet_family_edges — Relationship graph edges
CREATE TABLE public.wallet_family_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.wallet_families(id) ON DELETE CASCADE,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('FUNDED_BY','FUNDS_TO','CO_MINTED_WITH','SAME_UPSTREAM_SOURCE','TOKEN_TRANSFER_TO','PROFIT_RETURN_PATH','POSSIBLE_CEX_GATEWAY')),
  weight NUMERIC NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  confidence NUMERIC NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wfe_family ON public.wallet_family_edges(family_id);
CREATE UNIQUE INDEX idx_wfe_edge ON public.wallet_family_edges(family_id, from_wallet, to_wallet, edge_type);

-- 4. wallet_family_evidence — Raw evidence items
CREATE TABLE public.wallet_family_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.wallet_families(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  related_wallet TEXT,
  evidence_type TEXT NOT NULL,
  tx_signature TEXT,
  program_id TEXT,
  mint TEXT,
  amount_sol NUMERIC,
  timestamp TIMESTAMPTZ,
  score_delta NUMERIC NOT NULL DEFAULT 0,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wfev_family ON public.wallet_family_evidence(family_id);
CREATE INDEX idx_wfev_wallet ON public.wallet_family_evidence(wallet);

-- 5. wallet_family_mint_events — Detected mint events
CREATE TABLE public.wallet_family_mint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.wallet_families(id) ON DELETE CASCADE,
  mint_address TEXT NOT NULL,
  detected_by_wallet TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (event_type IN ('DIRECT_DEV_MINT','PROBABLE_DEV_ASSOCIATED_MINT','FAMILY_EARLY_ENTRY','SIBLING_WALLET_MINT','UNKNOWN')),
  confidence NUMERIC NOT NULL DEFAULT 0,
  tx_signature TEXT,
  token_name TEXT,
  token_symbol TEXT,
  launchpad TEXT,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wfme_family ON public.wallet_family_mint_events(family_id);
CREATE INDEX idx_wfme_mint ON public.wallet_family_mint_events(mint_address);

-- 6. wallet_family_poll_queue — Priority-based polling scheduler
CREATE TABLE public.wallet_family_poll_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  family_id UUID NOT NULL REFERENCES public.wallet_families(id) ON DELETE CASCADE,
  priority TEXT NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1','P2','P3','P4')),
  poll_interval_sec INTEGER NOT NULL DEFAULT 600,
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_polled_at TIMESTAMPTZ,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_result TEXT,
  burst_mode_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_wfpq_wallet ON public.wallet_family_poll_queue(wallet_address);
CREATE INDEX idx_wfpq_next ON public.wallet_family_poll_queue(next_poll_at);

-- Enable RLS on all tables (service-role access only for edge functions)
ALTER TABLE public.wallet_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_family_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_family_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_family_mint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_family_poll_queue ENABLE ROW LEVEL SECURITY;

-- Read-only policies for authenticated users (admin)
CREATE POLICY "Authenticated users can read wallet_families" ON public.wallet_families FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wallet_family_members" ON public.wallet_family_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wallet_family_edges" ON public.wallet_family_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wallet_family_evidence" ON public.wallet_family_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wallet_family_mint_events" ON public.wallet_family_mint_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wallet_family_poll_queue" ON public.wallet_family_poll_queue FOR SELECT TO authenticated USING (true);

-- Service role handles all writes via edge functions (no insert/update policies    needed for anon)
