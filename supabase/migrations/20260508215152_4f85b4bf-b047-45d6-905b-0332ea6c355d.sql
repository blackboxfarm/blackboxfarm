-- ============================================================
-- Phase 1: Token Lifecycle Scorecard + Dev Reputation v2
-- ============================================================

CREATE TABLE IF NOT EXISTS public.token_lifecycle_scorecard (
  token_mint TEXT PRIMARY KEY,
  dev_wallet TEXT,
  worth_gate_passed BOOLEAN NOT NULL DEFAULT false,
  worth_gate_reasons JSONB DEFAULT '[]'::jsonb,
  -- per-dimension sub-scores (0..100)
  mint_bonding_score NUMERIC,
  graduation_score NUMERIC,
  sustain_score NUMERIC,
  social_score NUMERIC,
  wallet_mesh_score NUMERIC,
  -- composite + the "5 lenses"
  composite_score NUMERIC,
  effort_score NUMERIC,
  skill_score NUMERIC,
  integrity_score NUMERIC,
  -- structured factor breakdown
  phase_scores JSONB DEFAULT '{}'::jsonb,
  factor_scores JSONB DEFAULT '{}'::jsonb,
  -- verdict
  verdict TEXT,
  verdict_confidence NUMERIC,
  -- audit trail of evidence (tx signatures + endpoints)
  solscan_evidence_refs JSONB DEFAULT '[]'::jsonb,
  scoring_version TEXT NOT NULL DEFAULT 'v1.0',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_scorecard_dev ON public.token_lifecycle_scorecard(dev_wallet);
CREATE INDEX IF NOT EXISTS idx_lifecycle_scorecard_verdict ON public.token_lifecycle_scorecard(verdict);
CREATE INDEX IF NOT EXISTS idx_lifecycle_scorecard_composite ON public.token_lifecycle_scorecard(composite_score DESC);

ALTER TABLE public.token_lifecycle_scorecard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read scorecards"
  ON public.token_lifecycle_scorecard FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages scorecards"
  ON public.token_lifecycle_scorecard FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================

CREATE TABLE IF NOT EXISTS public.dev_reputation_v2 (
  wallet_address TEXT PRIMARY KEY,
  tokens_scored INTEGER NOT NULL DEFAULT 0,
  tokens_of_worth INTEGER NOT NULL DEFAULT 0,
  -- distribution of verdicts: { expert:1, competent:2, sloppy:4, scammy:0 }
  distribution JSONB DEFAULT '{}'::jsonb,
  -- chronological list of {token_mint, verdict, scored_at, composite_score}
  career_arc JSONB DEFAULT '[]'::jsonb,
  -- weighted dimension rollups (0..100)
  weighted_effort NUMERIC,
  weighted_skill NUMERIC,
  weighted_integrity NUMERIC,
  weighted_sustain NUMERIC,
  weighted_social NUMERIC,
  composite NUMERIC,
  -- final career label
  archetype TEXT,
  -- highlights
  best_token_mint TEXT,
  worst_token_mint TEXT,
  peak_mcap_lifetime NUMERIC,
  total_buybacks_usd NUMERIC,
  total_boosts_usd NUMERIC,
  rollup_version TEXT NOT NULL DEFAULT 'v1.0',
  last_rolled_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_rep_v2_archetype ON public.dev_reputation_v2(archetype);
CREATE INDEX IF NOT EXISTS idx_dev_rep_v2_composite ON public.dev_reputation_v2(composite DESC);

ALTER TABLE public.dev_reputation_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read dev_reputation_v2"
  ON public.dev_reputation_v2 FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages dev_reputation_v2"
  ON public.dev_reputation_v2 FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Worth-gate helper: returns true if a token deserves full scoring
-- ============================================================

CREATE OR REPLACE FUNCTION public.passes_worth_gate(p_token_mint TEXT)
RETURNS TABLE(passes BOOLEAN, reasons JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reasons JSONB := '[]'::jsonb;
  v_lc RECORD;
  v_socials INT := 0;
BEGIN
  SELECT
    tl.market_cap,
    tl.ath_24h_usd,
    tl.liquidity_usd,
    tl.first_seen_at,
    tl.is_currently_top_200,
    tl.times_entered_top_200,
    tl.current_status,
    tl.metadata
  INTO v_lc
  FROM public.token_lifecycle tl
  WHERE tl.token_mint = p_token_mint
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '["no_lifecycle_row"]'::jsonb;
    RETURN;
  END IF;

  IF COALESCE(v_lc.ath_24h_usd, 0) >= 25000 OR COALESCE(v_lc.market_cap, 0) >= 25000 THEN
    v_reasons := v_reasons || '"peak_mcap_25k"'::jsonb;
  END IF;

  IF v_lc.first_seen_at IS NOT NULL
     AND v_lc.first_seen_at < (now() - interval '6 hours')
     AND COALESCE(v_lc.liquidity_usd, 0) >= 5000 THEN
    v_reasons := v_reasons || '"6h_5k_liq"'::jsonb;
  END IF;

  IF COALESCE(v_lc.times_entered_top_200, 0) >= 1 OR COALESCE(v_lc.is_currently_top_200, false) THEN
    v_reasons := v_reasons || '"top_200"'::jsonb;
  END IF;

  IF v_lc.current_status = 'graduated' OR (v_lc.metadata ? 'graduated_at') THEN
    v_reasons := v_reasons || '"graduated"'::jsonb;
  END IF;

  SELECT COUNT(*) INTO v_socials
  FROM public.token_social_links sl
  WHERE sl.token_mint = p_token_mint
    AND COALESCE(sl.is_verified, false) = true;

  IF v_socials >= 1 THEN
    v_reasons := v_reasons || '"verified_social"'::jsonb;
  END IF;

  RETURN QUERY SELECT (jsonb_array_length(v_reasons) > 0), v_reasons;
END;
$$;

GRANT EXECUTE ON FUNCTION public.passes_worth_gate(TEXT) TO authenticated, anon, service_role;