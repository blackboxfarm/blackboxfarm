
-- ===== Creator Fusion Audit Table =====
CREATE TABLE IF NOT EXISTS public.creator_fusion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  signals JSONB NOT NULL,
  creator_id UUID,
  is_new BOOLEAN,
  merged_absorbed_ids UUID[],
  aliases_written INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_creator_fusion_audit_ts ON public.creator_fusion_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_creator_fusion_audit_status_ts ON public.creator_fusion_audit (status, ts DESC);
CREATE INDEX IF NOT EXISTS idx_creator_fusion_audit_creator ON public.creator_fusion_audit (creator_id) WHERE creator_id IS NOT NULL;

ALTER TABLE public.creator_fusion_audit ENABLE ROW LEVEL SECURITY;

-- Admin-only visibility (uses existing has_role pattern)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $POL$
      CREATE POLICY "Admins can view fusion audit"
      ON public.creator_fusion_audit FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
    $POL$;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role inserts (edge functions)
CREATE POLICY "Service role manages fusion audit"
  ON public.creator_fusion_audit FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ===== Prune Function =====
CREATE OR REPLACE FUNCTION public.prune_creator_fusion_audit()
RETURNS TABLE(deleted_success BIGINT, deleted_error BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ds BIGINT;
  de BIGINT;
BEGIN
  WITH d AS (DELETE FROM public.creator_fusion_audit WHERE status = 'success' AND ts < now() - INTERVAL '14 days' RETURNING 1)
  SELECT count(*) INTO ds FROM d;
  WITH d AS (DELETE FROM public.creator_fusion_audit WHERE status = 'error' AND ts < now() - INTERVAL '90 days' RETURNING 1)
  SELECT count(*) INTO de FROM d;
  RETURN QUERY SELECT ds, de;
END;
$$;

-- ===== Morning Report fusion_stats column =====
ALTER TABLE public.morning_reports
  ADD COLUMN IF NOT EXISTS fusion_stats JSONB;
