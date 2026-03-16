
-- ============================================================
-- Allstar Dev Registry: tracks qualified devs with proven mcap history
-- ============================================================
CREATE TABLE public.allstar_dev_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid REFERENCES public.developer_profiles(id) ON DELETE CASCADE,
  master_wallet text NOT NULL,
  twitter_handle text,
  kyc_root_wallet text,
  best_tier integer NOT NULL DEFAULT 0,
  best_token_mint text,
  best_token_symbol text,
  best_mcap_achieved numeric DEFAULT 0,
  total_proven_tokens integer DEFAULT 0,
  total_wallet_family_size integer DEFAULT 0,
  family_wallets jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired', 'blacklisted')),
  last_audit_at timestamptz,
  last_mint_detected_at timestamptz,
  audit_count integer DEFAULT 0,
  new_mints_found integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(master_wallet)
);

CREATE INDEX idx_allstar_dev_registry_status ON public.allstar_dev_registry(status);
CREATE INDEX idx_allstar_dev_registry_tier ON public.allstar_dev_registry(best_tier DESC);
CREATE INDEX idx_allstar_dev_registry_last_audit ON public.allstar_dev_registry(last_audit_at ASC NULLS FIRST);
CREATE INDEX idx_allstar_dev_registry_developer ON public.allstar_dev_registry(developer_id);

ALTER TABLE public.allstar_dev_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read allstar registry" ON public.allstar_dev_registry
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage allstar registry" ON public.allstar_dev_registry
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- Allstar Mint Alerts: dedicated high-signal alerts for allstar dev launches
-- ============================================================
CREATE TABLE public.allstar_mint_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allstar_id uuid REFERENCES public.allstar_dev_registry(id) ON DELETE CASCADE,
  developer_id uuid,
  token_mint text NOT NULL,
  token_symbol text,
  token_name text,
  creator_wallet text NOT NULL,
  detecting_wallet text,
  wallet_depth integer DEFAULT 0,
  allstar_tier integer,
  allstar_best_mcap numeric,
  launchpad text,
  alert_level text NOT NULL DEFAULT 'opportunity' CHECK (alert_level IN ('opportunity', 'high_priority', 'critical')),
  is_acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_allstar_mint_alerts_created ON public.allstar_mint_alerts(created_at DESC);
CREATE INDEX idx_allstar_mint_alerts_level ON public.allstar_mint_alerts(alert_level);
CREATE INDEX idx_allstar_mint_alerts_token ON public.allstar_mint_alerts(token_mint);

ALTER TABLE public.allstar_mint_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read allstar mint alerts" ON public.allstar_mint_alerts
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage allstar mint alerts" ON public.allstar_mint_alerts
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- Add lower tiers to proven_dev_tokens (200k = tier -1, 300k = tier 0)
-- We'll use tier 0 for 200k+ and keep tier 1 as 400k but also add 300k
-- Better approach: add new tier columns and use a wider range
-- ============================================================
ALTER TABLE public.proven_dev_tokens 
  ADD COLUMN IF NOT EXISTS tier_200k_at timestamptz,
  ADD COLUMN IF NOT EXISTS tier_300k_at timestamptz;
