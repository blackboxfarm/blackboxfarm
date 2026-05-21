
-- =============================================================
-- LAUNCHERS: Dev mint sniper subsystem
-- =============================================================

CREATE TABLE IF NOT EXISTS public.launcher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  x_handle text,
  x_user_id text,
  primary_dev_wallet text,
  linked_wallets text[] NOT NULL DEFAULT '{}',
  kyc_root_wallet text,
  spider_depth int NOT NULL DEFAULT 3,
  last_spidered_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS launcher_profiles_name_uniq ON public.launcher_profiles (lower(name));
CREATE INDEX IF NOT EXISTS launcher_profiles_xhandle_idx ON public.launcher_profiles (lower(x_handle));
CREATE INDEX IF NOT EXISTS launcher_profiles_dev_idx ON public.launcher_profiles (primary_dev_wallet);

CREATE TABLE IF NOT EXISTS public.launcher_trade_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launcher_profile_id uuid NOT NULL REFERENCES public.launcher_profiles(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'limit_order',
  buy_amount_sol numeric NOT NULL DEFAULT 0.01,
  slippage_bps int NOT NULL DEFAULT 1500,
  priority_fee_lamports bigint NOT NULL DEFAULT 100000,
  jito_tip_lamports bigint NOT NULL DEFAULT 100000,
  target_factor numeric NOT NULL DEFAULT 2.0,
  min_seconds_after_mint int NOT NULL DEFAULT 4,
  require_dev_buy_min_sol numeric NOT NULL DEFAULT 0,
  max_daily_spend_sol numeric NOT NULL DEFAULT 1.0,
  max_hold_seconds int NOT NULL DEFAULT 3600,
  funding_wallet_id uuid REFERENCES public.blackbox_wallets(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (launcher_profile_id)
);

CREATE TABLE IF NOT EXISTS public.launcher_mint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launcher_profile_id uuid NOT NULL REFERENCES public.launcher_profiles(id) ON DELETE CASCADE,
  mint_address text NOT NULL,
  symbol text,
  name text,
  dev_wallet_used text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  dev_initial_buy_sol numeric,
  initial_mcap_usd numeric,
  status text NOT NULL DEFAULT 'detected',
  skip_reason text,
  buy_tx_sig text,
  buy_filled_at timestamptz,
  buy_amount_sol numeric,
  entry_mcap_usd numeric,
  entry_price_usd numeric,
  highest_mcap_usd numeric,
  sell_tx_sig text,
  sell_filled_at timestamptz,
  exit_mcap_usd numeric,
  exit_price_usd numeric,
  realized_pnl_sol numeric,
  realized_pnl_usd numeric,
  multiple_realized numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS launcher_mint_events_profile_mint_uniq
  ON public.launcher_mint_events (launcher_profile_id, mint_address);
CREATE INDEX IF NOT EXISTS launcher_mint_events_status_idx ON public.launcher_mint_events (status);
CREATE INDEX IF NOT EXISTS launcher_mint_events_detected_idx ON public.launcher_mint_events (detected_at DESC);

CREATE TABLE IF NOT EXISTS public.launcher_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mint_address text NOT NULL,
  launcher_profile_id uuid REFERENCES public.launcher_profiles(id) ON DELETE CASCADE,
  links_found jsonb NOT NULL DEFAULT '{}'::jsonb,
  found_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mint_address, launcher_profile_id)
);

CREATE TABLE IF NOT EXISTS public.launcher_global_kill_switch (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  killed boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.launcher_global_kill_switch (id, killed) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- Timestamp triggers
CREATE OR REPLACE FUNCTION public.tg_launchers_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS launcher_profiles_touch ON public.launcher_profiles;
CREATE TRIGGER launcher_profiles_touch BEFORE UPDATE ON public.launcher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_launchers_touch();
DROP TRIGGER IF EXISTS launcher_trade_rules_touch ON public.launcher_trade_rules;
CREATE TRIGGER launcher_trade_rules_touch BEFORE UPDATE ON public.launcher_trade_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_launchers_touch();
DROP TRIGGER IF EXISTS launcher_mint_events_touch ON public.launcher_mint_events;
CREATE TRIGGER launcher_mint_events_touch BEFORE UPDATE ON public.launcher_mint_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_launchers_touch();

-- RLS: super-admin only
ALTER TABLE public.launcher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_trade_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_mint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_global_kill_switch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launcher_profiles_admin ON public.launcher_profiles;
CREATE POLICY launcher_profiles_admin ON public.launcher_profiles
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS launcher_trade_rules_admin ON public.launcher_trade_rules;
CREATE POLICY launcher_trade_rules_admin ON public.launcher_trade_rules
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS launcher_mint_events_admin ON public.launcher_mint_events;
CREATE POLICY launcher_mint_events_admin ON public.launcher_mint_events
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS launcher_enrichment_admin ON public.launcher_enrichment;
CREATE POLICY launcher_enrichment_admin ON public.launcher_enrichment
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS launcher_kill_switch_admin ON public.launcher_global_kill_switch;
CREATE POLICY launcher_kill_switch_admin ON public.launcher_global_kill_switch
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
