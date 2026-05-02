CREATE TABLE IF NOT EXISTS public.autopsy_tx_evidence (
  candidate_id uuid PRIMARY KEY REFERENCES public.autopsy_candidates(id) ON DELETE CASCADE,
  token_mint text NOT NULL,
  creator_wallet text,
  funder_wallet text,
  funder_funded_amount_sol numeric,
  funder_funded_at timestamptz,
  funder_minutes_before_launch numeric,
  launch_tx_signature text,
  launch_tx_at timestamptz,
  dev_buy_amount_tokens numeric,
  dev_buy_sol numeric,
  dev_buy_pct_of_curve numeric,
  co_snipers jsonb DEFAULT '[]'::jsonb,
  atomic_snipe_pct numeric,
  dev_signatures jsonb DEFAULT '[]'::jsonb,
  dev_final_action_at timestamptz,
  dev_final_action_kind text,
  dev_final_action_signature text,
  dump_cascade jsonb,
  post_dump_flow jsonb DEFAULT '[]'::jsonb,
  usdc_consolidation_observed boolean DEFAULT false,
  time_of_death_at timestamptz,
  notes text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autopsy_tx_evidence_token_mint_idx
  ON public.autopsy_tx_evidence(token_mint);

ALTER TABLE public.autopsy_tx_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read autopsy_tx_evidence"
  ON public.autopsy_tx_evidence
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super admins manage autopsy_tx_evidence"
  ON public.autopsy_tx_evidence
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_autopsy_tx_evidence_updated_at
  BEFORE UPDATE ON public.autopsy_tx_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
