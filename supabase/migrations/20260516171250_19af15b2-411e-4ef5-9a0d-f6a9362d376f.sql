CREATE TABLE public.holders_intel_backfill_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  archive_id UUID NOT NULL REFERENCES public.holders_intel_post_queue(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  tg_message_id BIGINT NOT NULL,
  tg_message_date TIMESTAMPTZ NOT NULL,
  tg_raw_text TEXT,
  match_diff_hours NUMERIC,
  before_json JSONB NOT NULL,
  after_json JSONB NOT NULL,
  patch_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  applied_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposals_status_chk CHECK (status IN ('pending','accepted','rejected','applied','reverted')),
  CONSTRAINT proposals_unique_msg UNIQUE (archive_id, tg_message_id)
);

CREATE INDEX idx_backfill_proposals_status ON public.holders_intel_backfill_proposals(status);
CREATE INDEX idx_backfill_proposals_archive ON public.holders_intel_backfill_proposals(archive_id);
CREATE INDEX idx_backfill_proposals_created ON public.holders_intel_backfill_proposals(created_at DESC);

ALTER TABLE public.holders_intel_backfill_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage backfill proposals"
ON public.holders_intel_backfill_proposals
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Service role can manage backfill proposals"
ON public.holders_intel_backfill_proposals
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_backfill_proposals_updated_at
BEFORE UPDATE ON public.holders_intel_backfill_proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();