
-- ============ dev_token_history ============
CREATE TABLE IF NOT EXISTS public.dev_token_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dev_wallet text NOT NULL,
  token_mint text NOT NULL,
  launchpad text,
  ticker text,
  name text,
  image_url text,
  created_at_chain timestamptz,
  pumpfun_market_cap_usd numeric,
  pumpfun_complete boolean DEFAULT false,
  last_trade_at timestamptz,
  outcome_class text CHECK (outcome_class IN (
    'success_sustained','success_flash','mid','dead_low','graduated_then_died'
  )),
  cause_class text CHECK (cause_class IN (
    'skill_build','viral_meme','marketed_meme','community_collapse',
    'inexperience_fail','slow_bleed','hard_rug','bundle_rug','dev_abandoned'
  )),
  cause_confidence int CHECK (cause_confidence BETWEEN 0 AND 100),
  cause_evidence jsonb DEFAULT '{}'::jsonb,
  classified_at timestamptz,
  ai_used boolean DEFAULT false,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dev_wallet, token_mint)
);

CREATE INDEX IF NOT EXISTS idx_dth_dev ON public.dev_token_history(dev_wallet);
CREATE INDEX IF NOT EXISTS idx_dth_mint ON public.dev_token_history(token_mint);
CREATE INDEX IF NOT EXISTS idx_dth_outcome ON public.dev_token_history(dev_wallet, outcome_class);
CREATE INDEX IF NOT EXISTS idx_dth_cause ON public.dev_token_history(dev_wallet, cause_class);
CREATE INDEX IF NOT EXISTS idx_dth_unclassified ON public.dev_token_history(dev_wallet) WHERE cause_class IS NULL;

ALTER TABLE public.dev_token_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_token_history public read"
  ON public.dev_token_history FOR SELECT USING (true);

-- (No insert/update/delete policies → only service role can write.)


-- ============ dev_track_record_summary ============
CREATE TABLE IF NOT EXISTS public.dev_track_record_summary (
  dev_wallet text PRIMARY KEY,
  total_tokens int NOT NULL DEFAULT 0,
  classified_tokens int NOT NULL DEFAULT 0,
  by_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_cause jsonb NOT NULL DEFAULT '{}'::jsonb,

  sustained_hits int NOT NULL DEFAULT 0,
  flash_hits int NOT NULL DEFAULT 0,
  hard_rugs int NOT NULL DEFAULT 0,
  slow_bleeds int NOT NULL DEFAULT 0,
  bundle_rugs int NOT NULL DEFAULT 0,
  community_collapses int NOT NULL DEFAULT 0,
  inexperience_fails int NOT NULL DEFAULT 0,
  dev_abandoneds int NOT NULL DEFAULT 0,
  viral_memes int NOT NULL DEFAULT 0,
  marketed_memes int NOT NULL DEFAULT 0,
  skill_builds int NOT NULL DEFAULT 0,

  skill_index int CHECK (skill_index BETWEEN 0 AND 100),
  intent_index int CHECK (intent_index BETWEEN -100 AND 100),
  luck_index int CHECK (luck_index BETWEEN 0 AND 100),

  verdict_label text,
  verdict_one_liner text,
  ai_interpretation text,

  best_token_mint text,
  best_token_ticker text,
  best_token_ath_usd numeric,

  last_full_scrape_at timestamptz,
  last_classified_at timestamptz,
  last_recomputed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dtrs_skill ON public.dev_track_record_summary(skill_index DESC);
CREATE INDEX IF NOT EXISTS idx_dtrs_intent ON public.dev_track_record_summary(intent_index);

ALTER TABLE public.dev_track_record_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_track_record_summary public read"
  ON public.dev_track_record_summary FOR SELECT USING (true);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.dev_token_history_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dth_updated_at ON public.dev_token_history;
CREATE TRIGGER trg_dth_updated_at
  BEFORE UPDATE ON public.dev_token_history
  FOR EACH ROW EXECUTE FUNCTION public.dev_token_history_set_updated_at();
