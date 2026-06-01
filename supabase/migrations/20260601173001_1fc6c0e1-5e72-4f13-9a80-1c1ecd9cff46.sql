-- ============================================================
-- Per-Profile Subscription Bot — DB schema
-- ============================================================

-- 1) profile_subscription_configs ------------------------------
CREATE TABLE public.profile_subscription_configs (
  profile_key text PRIMARY KEY,
  display_name text NOT NULL,
  bot_secret_name text NOT NULL, -- e.g. NO_LUBE_BOT_TELEGRAM_API_KEY
  bot_username text,
  private_chat_id text,          -- Telegram channel/supergroup ID (string, may be negative)
  welcome_copy text DEFAULT '',
  expiry_copy text DEFAULT '',
  base_currency text NOT NULL DEFAULT 'USD',
  display_currencies text[] NOT NULL DEFAULT ARRAY['USD','EUR','TRY','BRL','MXN'],
  central_wallet_pubkey text,
  central_wallet_secret_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_subscription_configs TO authenticated;
GRANT ALL ON public.profile_subscription_configs TO service_role;

ALTER TABLE public.profile_subscription_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage profile_subscription_configs"
  ON public.profile_subscription_configs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_profile_subscription_configs_updated
  BEFORE UPDATE ON public.profile_subscription_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) profile_subscription_tiers --------------------------------
CREATE TABLE public.profile_subscription_tiers (
  profile_key text NOT NULL REFERENCES public.profile_subscription_configs(profile_key) ON DELETE CASCADE,
  tier_months int NOT NULL CHECK (tier_months > 0),
  price_fiat numeric(12,2) NOT NULL CHECK (price_fiat > 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_key, tier_months)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_subscription_tiers TO authenticated;
GRANT ALL ON public.profile_subscription_tiers TO service_role;

ALTER TABLE public.profile_subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage profile_subscription_tiers"
  ON public.profile_subscription_tiers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_profile_subscription_tiers_updated
  BEFORE UPDATE ON public.profile_subscription_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) profile_subscriptions -------------------------------------
CREATE TABLE public.profile_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL REFERENCES public.profile_subscription_configs(profile_key) ON DELETE RESTRICT,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  language text,
  country text,
  tier_months int NOT NULL,
  price_fiat numeric(12,2) NOT NULL,
  base_currency text NOT NULL,
  quoted_sol numeric(20,9) NOT NULL,
  sol_price_at_order numeric(14,4),
  payment_wallet_pubkey text NOT NULL UNIQUE,
  payment_wallet_secret_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','kicked','swept','cancelled')),
  tx_signature text,
  paid_at timestamptz,
  expires_at timestamptz,
  invite_link text,
  sweep_tx_signature text,
  swept_at timestamptz,
  quote_window_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active sub per (profile, tg user)
CREATE UNIQUE INDEX uq_profile_subscriptions_active
  ON public.profile_subscriptions (profile_key, telegram_user_id)
  WHERE status IN ('pending','paid');

CREATE INDEX idx_profile_subscriptions_status ON public.profile_subscriptions (status);
CREATE INDEX idx_profile_subscriptions_expires ON public.profile_subscriptions (expires_at);
CREATE INDEX idx_profile_subscriptions_profile ON public.profile_subscriptions (profile_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_subscriptions TO authenticated;
GRANT ALL ON public.profile_subscriptions TO service_role;

ALTER TABLE public.profile_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage profile_subscriptions"
  ON public.profile_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_profile_subscriptions_updated
  BEFORE UPDATE ON public.profile_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) subscription_reminder_log ---------------------------------
CREATE TABLE public.subscription_reminder_log (
  subscription_id uuid NOT NULL REFERENCES public.profile_subscriptions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('t_3d','t_24h','t_3h','expired','welcome','renew_prompt')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_reminder_log TO authenticated;
GRANT ALL ON public.subscription_reminder_log TO service_role;

ALTER TABLE public.subscription_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage subscription_reminder_log"
  ON public.subscription_reminder_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 5) fx_rates_daily --------------------------------------------
CREATE TABLE public.fx_rates_daily (
  date date NOT NULL,
  base text NOT NULL,
  quote text NOT NULL,
  rate numeric(20,8) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, base, quote)
);

GRANT SELECT ON public.fx_rates_daily TO anon;
GRANT SELECT ON public.fx_rates_daily TO authenticated;
GRANT ALL ON public.fx_rates_daily TO service_role;

ALTER TABLE public.fx_rates_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fx_rates_daily readable by all"
  ON public.fx_rates_daily
  FOR SELECT
  USING (true);
