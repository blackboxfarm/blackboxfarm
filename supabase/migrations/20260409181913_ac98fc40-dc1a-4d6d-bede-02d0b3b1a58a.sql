
-- Table for SOL-based yearly subscriptions via Telegram
CREATE TABLE public.tg_sol_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL,
  payment_wallet_pubkey TEXT NOT NULL,
  payment_wallet_secret_encrypted TEXT NOT NULL,
  amount_sol NUMERIC NOT NULL DEFAULT 1.0,
  sol_price_at_order NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'swept')),
  tier_granted TEXT NOT NULL DEFAULT 'pro',
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  sweep_tx_signature TEXT,
  swept_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tg_sol_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admins can see all
CREATE POLICY "Super admins can manage tg_sol_subscriptions"
  ON public.tg_sol_subscriptions FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Users can view their own
CREATE POLICY "Users can view own tg_sol_subscriptions"
  ON public.tg_sol_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_tg_sol_subs_tg_user ON public.tg_sol_subscriptions(telegram_user_id);
CREATE INDEX idx_tg_sol_subs_status ON public.tg_sol_subscriptions(status);
CREATE INDEX idx_tg_sol_subs_user ON public.tg_sol_subscriptions(user_id);
