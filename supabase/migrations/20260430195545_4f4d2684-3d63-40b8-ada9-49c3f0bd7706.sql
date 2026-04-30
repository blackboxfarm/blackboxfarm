-- Autopsy v2: natural_cycle, enrichment columns, versioning, evidence blobs

-- 1. autopsy_candidates enrichment columns
ALTER TABLE public.autopsy_candidates
  ADD COLUMN IF NOT EXISTS social_completeness smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS x_community_member_count integer,
  ADD COLUMN IF NOT EXISTS x_community_mod_count integer,
  ADD COLUMN IF NOT EXISTS x_community_admin_count integer,
  ADD COLUMN IF NOT EXISTS telegram_subscriber_count integer,
  ADD COLUMN IF NOT EXISTS discord_present boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS boosts_paid_usd numeric,
  ADD COLUMN IF NOT EXISTS dex_paid boolean,
  ADD COLUMN IF NOT EXISTS holders_at_ath integer,
  ADD COLUMN IF NOT EXISTS dev_holding_pct_at_death numeric,
  ADD COLUMN IF NOT EXISTS dev_dossier jsonb,
  ADD COLUMN IF NOT EXISTS manual_tg_join_completed boolean DEFAULT false;

-- 2. autopsy_reports versioning
ALTER TABLE public.autopsy_reports
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- Drop old unique on slug (if exists) and replace with (slug, version)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.autopsy_reports'::regclass
      AND contype = 'u'
      AND conname = 'autopsy_reports_slug_key'
  ) THEN
    ALTER TABLE public.autopsy_reports DROP CONSTRAINT autopsy_reports_slug_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS autopsy_reports_slug_version_idx
  ON public.autopsy_reports (slug, version);

CREATE INDEX IF NOT EXISTS autopsy_reports_current_idx
  ON public.autopsy_reports (slug) WHERE is_current = true;

-- 3. Evidence blobs (TG deep pulls, X community scrapes, etc.)
CREATE TABLE IF NOT EXISTS public.autopsy_evidence_blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.autopsy_candidates(id) ON DELETE CASCADE,
  token_mint text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS autopsy_evidence_blobs_candidate_idx
  ON public.autopsy_evidence_blobs (candidate_id, kind);
CREATE INDEX IF NOT EXISTS autopsy_evidence_blobs_mint_idx
  ON public.autopsy_evidence_blobs (token_mint, kind);

ALTER TABLE public.autopsy_evidence_blobs ENABLE ROW LEVEL SECURITY;

-- Admins can manage; service role bypasses RLS
CREATE POLICY "Admins manage autopsy evidence blobs"
  ON public.autopsy_evidence_blobs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4. Backfill social_completeness for existing candidates
UPDATE public.autopsy_candidates c
SET social_completeness = sub.cnt
FROM (
  SELECT token_mint, COUNT(DISTINCT platform)::smallint AS cnt
  FROM public.token_social_links
  GROUP BY token_mint
) sub
WHERE sub.token_mint = c.token_mint;