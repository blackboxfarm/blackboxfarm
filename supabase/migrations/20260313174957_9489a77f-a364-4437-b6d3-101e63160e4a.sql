
-- Channel/Group installations table
CREATE TABLE public.channel_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  chat_title TEXT,
  chat_type TEXT NOT NULL DEFAULT 'group' CHECK (chat_type IN ('group', 'supergroup', 'channel')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  kicked BOOLEAN NOT NULL DEFAULT false,
  admin_config JSONB NOT NULL DEFAULT '{
    "delay_ms": 0,
    "verbose": true,
    "admin_only_commands": false,
    "enabled_tiers": ["free","auth"],
    "dev_wallet_alerts": false
  }'::jsonb,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, chat_id)
);

ALTER TABLE public.channel_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own installations"
  ON public.channel_installations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own installations"
  ON public.channel_installations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own installations"
  ON public.channel_installations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Payment wallets for channel installations (one wallet per install)
CREATE TABLE public.channel_payment_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES public.channel_installations(id) ON DELETE CASCADE,
  pubkey TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  required_sol NUMERIC NOT NULL DEFAULT 0.25,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id)
);

ALTER TABLE public.channel_payment_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channel wallets"
  ON public.channel_payment_wallets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_installations ci
      WHERE ci.id = installation_id AND ci.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own channel wallets"
  ON public.channel_payment_wallets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_installations ci
      WHERE ci.id = installation_id AND ci.user_id = auth.uid()
    )
  );
