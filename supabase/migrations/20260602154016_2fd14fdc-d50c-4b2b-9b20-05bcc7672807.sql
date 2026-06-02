
-- Extend profile_subscription_configs with managed central wallet fields
ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS central_wallet_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS central_wallet_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS central_wallet_label text;

-- Audit log for treasury withdrawals
CREATE TABLE IF NOT EXISTS public.profile_central_wallet_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  from_pubkey text NOT NULL,
  to_pubkey text NOT NULL,
  lamports bigint NOT NULL,
  signature text,
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pcww_profile_created
  ON public.profile_central_wallet_withdrawals (profile_key, created_at DESC);

GRANT ALL ON public.profile_central_wallet_withdrawals TO service_role;

ALTER TABLE public.profile_central_wallet_withdrawals ENABLE ROW LEVEL SECURITY;

-- Super-admins can read withdrawal history through the admin UI / edge function
CREATE POLICY "Super admins can read treasury withdrawals"
  ON public.profile_central_wallet_withdrawals
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
