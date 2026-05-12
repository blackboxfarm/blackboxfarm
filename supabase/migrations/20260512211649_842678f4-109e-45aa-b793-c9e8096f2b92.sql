CREATE TABLE IF NOT EXISTS public.dev_family_track_record_summary (
  dev_wallet text PRIMARY KEY,
  family_size integer NOT NULL DEFAULT 0,
  family_wallets jsonb NOT NULL DEFAULT '[]'::jsonb,
  kyc_root_wallet text,
  kyc_root_label text,
  total_tokens integer NOT NULL DEFAULT 0,
  sustained_hits integer NOT NULL DEFAULT 0,
  flash_hits integer NOT NULL DEFAULT 0,
  viral_memes integer NOT NULL DEFAULT 0,
  marketed_memes integer NOT NULL DEFAULT 0,
  inexperience_fails integer NOT NULL DEFAULT 0,
  dev_abandoneds integer NOT NULL DEFAULT 0,
  slow_bleeds integer NOT NULL DEFAULT 0,
  hard_rugs integer NOT NULL DEFAULT 0,
  bundle_rugs integer NOT NULL DEFAULT 0,
  community_collapses integer NOT NULL DEFAULT 0,
  skill_builds integer NOT NULL DEFAULT 0,
  skill_index integer,
  intent_index integer,
  luck_index integer,
  verdict_label text,
  verdict_one_liner text,
  ai_interpretation text,
  best_token_mint text,
  best_token_ticker text,
  best_token_ath_usd numeric,
  by_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_cause jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_recomputed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dev_family_track_record_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_track_public_read"
  ON public.dev_family_track_record_summary FOR SELECT
  USING (true);
