ALTER TABLE public.autopsy_tx_evidence
  ADD COLUMN IF NOT EXISTS exit_group jsonb,
  ADD COLUMN IF NOT EXISTS exit_pattern text,
  ADD COLUMN IF NOT EXISTS collapse_window jsonb,
  ADD COLUMN IF NOT EXISTS exit_group_linkage_summary jsonb,
  ADD COLUMN IF NOT EXISTS exit_verdict text;