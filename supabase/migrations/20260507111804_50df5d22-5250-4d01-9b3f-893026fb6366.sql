
ALTER TABLE public.autopsy_tx_evidence
  ADD COLUMN IF NOT EXISTS cluster_dump_provenance jsonb,
  ADD COLUMN IF NOT EXISTS cluster_capture_pct numeric,
  ADD COLUMN IF NOT EXISTS cluster_dump_verdict text;

ALTER TABLE public.autopsy_candidates
  ADD COLUMN IF NOT EXISTS social_x_account_status text,
  ADD COLUMN IF NOT EXISTS social_x_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_gaps jsonb,
  ADD COLUMN IF NOT EXISTS dev_realized_value_usd numeric;
