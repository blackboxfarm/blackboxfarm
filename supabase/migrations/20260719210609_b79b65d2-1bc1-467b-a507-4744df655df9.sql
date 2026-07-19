
CREATE TABLE public.alpha_dev_wallets (
  dev_wallet TEXT PRIMARY KEY,
  best_multiplier NUMERIC,
  best_ticker TEXT,
  best_mint TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  avg_multiplier NUMERIC,
  tickers TEXT[] NOT NULL DEFAULT '{}',
  mints TEXT[] NOT NULL DEFAULT '{}',
  kyc_root TEXT,
  kyc_label TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alpha_dev_wallets TO authenticated;
GRANT ALL ON public.alpha_dev_wallets TO service_role;
ALTER TABLE public.alpha_dev_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alpha devs" ON public.alpha_dev_wallets
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.alpha_kyc_groups (
  kyc_root TEXT PRIMARY KEY,
  kyc_label TEXT,
  distinct_dev_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  best_multiplier NUMERIC,
  best_ticker TEXT,
  best_mint TEXT,
  avg_multiplier NUMERIC,
  dev_wallets TEXT[] NOT NULL DEFAULT '{}',
  tickers TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alpha_kyc_groups TO authenticated;
GRANT ALL ON public.alpha_kyc_groups TO service_role;
ALTER TABLE public.alpha_kyc_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alpha kyc groups" ON public.alpha_kyc_groups
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.alpha_paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint TEXT NOT NULL UNIQUE,
  ticker TEXT,
  entry_market_cap NUMERIC,
  entry_price_usd NUMERIC,
  size_usd NUMERIC NOT NULL DEFAULT 100,
  strategy TEXT NOT NULL DEFAULT 'hold',
  status TEXT NOT NULL DEFAULT 'open',
  match_kind TEXT NOT NULL,
  matched_dev_wallet TEXT,
  matched_kyc_root TEXT,
  matched_kyc_label TEXT,
  dev_best_multiplier NUMERIC,
  dev_best_ticker TEXT,
  group_token_count INTEGER,
  group_avg_multiplier NUMERIC,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'insiders',
  sms_status TEXT,
  sms_error TEXT,
  sms_sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alpha_paper_trades TO authenticated;
GRANT ALL ON public.alpha_paper_trades TO service_role;
ALTER TABLE public.alpha_paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alpha paper trades" ON public.alpha_paper_trades
  FOR SELECT TO authenticated USING (true);
CREATE INDEX alpha_paper_trades_created_idx ON public.alpha_paper_trades (created_at DESC);
CREATE INDEX alpha_paper_trades_dev_idx ON public.alpha_paper_trades (matched_dev_wallet);
CREATE INDEX alpha_paper_trades_kyc_idx ON public.alpha_paper_trades (matched_kyc_root);

CREATE TABLE public.alpha_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  min_best_multiplier NUMERIC NOT NULL DEFAULT 10,
  min_repeat_token_count INTEGER NOT NULL DEFAULT 2,
  min_repeat_avg_multiplier NUMERIC NOT NULL DEFAULT 3,
  kyc_min_distinct_devs INTEGER NOT NULL DEFAULT 3,
  kyc_min_avg_multiplier NUMERIC NOT NULL DEFAULT 2,
  paper_size_usd NUMERIC NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alpha_config_singleton CHECK (id = 1)
);
GRANT SELECT ON public.alpha_config TO authenticated;
GRANT ALL ON public.alpha_config TO service_role;
ALTER TABLE public.alpha_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alpha config" ON public.alpha_config
  FOR SELECT TO authenticated USING (true);
INSERT INTO public.alpha_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER alpha_dev_wallets_updated BEFORE UPDATE ON public.alpha_dev_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER alpha_kyc_groups_updated BEFORE UPDATE ON public.alpha_kyc_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER alpha_paper_trades_updated BEFORE UPDATE ON public.alpha_paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
