CREATE TABLE IF NOT EXISTS public.token_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  snapshot_hour timestamptz NOT NULL,
  health_score integer,
  health_grade text,
  risk_signal text,
  risk_label text,
  risk_emoji text,
  total_holders integer,
  real_holders integer,
  dust_percentage real,
  whale_count integer,
  top10_pct real,
  source text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_mint, snapshot_hour)
);

CREATE INDEX idx_health_snapshots_mint_hour ON public.token_health_snapshots(token_mint, snapshot_hour DESC);

ALTER TABLE public.token_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read health snapshots"
  ON public.token_health_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);