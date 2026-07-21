
ALTER TABLE public.insiders_recap_entries
  ADD COLUMN IF NOT EXISTS person_root_wallet TEXT,
  ADD COLUMN IF NOT EXISTS person_root_via_cex TEXT,
  ADD COLUMN IF NOT EXISTS person_root_depth INT,
  ADD COLUMN IF NOT EXISTS person_root_source TEXT,
  ADD COLUMN IF NOT EXISTS person_root_resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_insiders_recap_entries_person_root
  ON public.insiders_recap_entries (person_root_wallet)
  WHERE person_root_wallet IS NOT NULL;
