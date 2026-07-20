
CREATE TABLE IF NOT EXISTS public.insiders_recap_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_type text NOT NULL CHECK (recap_type IN ('daily','weekly','monthly')),
  recap_date date NOT NULL,
  rank integer,
  ticker text,
  token_mint text NOT NULL,
  entry_mcap numeric,
  peak_mcap numeric,
  multiplier numeric,
  dev_wallet text,
  dev_resolution_source text,
  kyc_root_wallet text,
  kyc_root_label text,
  kyc_source_type text,
  source_message_id bigint,
  source_message_ts timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insiders_recap_entries_uniq UNIQUE (recap_type, token_mint, recap_date)
);

CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_type_date ON public.insiders_recap_entries (recap_type, recap_date DESC);
CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_dev_wallet ON public.insiders_recap_entries (dev_wallet) WHERE dev_wallet IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_kyc ON public.insiders_recap_entries (kyc_root_wallet) WHERE kyc_root_wallet IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_mint ON public.insiders_recap_entries (token_mint);
CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_dev_null ON public.insiders_recap_entries (recap_date) WHERE dev_wallet IS NULL;

GRANT SELECT ON public.insiders_recap_entries TO authenticated;
GRANT ALL ON public.insiders_recap_entries TO service_role;

ALTER TABLE public.insiders_recap_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read insiders recap entries"
  ON public.insiders_recap_entries FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages insiders recap entries"
  ON public.insiders_recap_entries FOR ALL
  TO service_role USING (true) WITH CHECK (true);
