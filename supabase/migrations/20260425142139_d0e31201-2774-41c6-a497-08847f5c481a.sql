ALTER TABLE public.intel_publications
  ADD COLUMN IF NOT EXISTS is_breadcrumb boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_intel_publications_briefing_id
  ON public.intel_publications(briefing_id);