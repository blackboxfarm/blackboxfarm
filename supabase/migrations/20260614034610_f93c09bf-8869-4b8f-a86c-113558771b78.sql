
CREATE TABLE public.waterfall_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_index int NOT NULL CHECK (column_index BETWEEN 0 AND 9),
  row_index int NOT NULL CHECK (row_index BETWEEN -1 AND 9),
  nickname text,
  pubkey text NOT NULL UNIQUE,
  secret_key_encrypted text NOT NULL,
  sol_balance numeric NOT NULL DEFAULT 0,
  last_balance_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (column_index, row_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waterfall_wallets TO authenticated;
GRANT ALL ON public.waterfall_wallets TO service_role;

ALTER TABLE public.waterfall_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view waterfall wallets"
  ON public.waterfall_wallets FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update waterfall wallets"
  ON public.waterfall_wallets FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_waterfall_wallets_updated_at
  BEFORE UPDATE ON public.waterfall_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
