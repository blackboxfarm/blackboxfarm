
-- Add trading-rule knobs to alpha_config
ALTER TABLE public.alpha_config
  ADD COLUMN IF NOT EXISTS stop_loss_pct numeric NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS stale_hours integer NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS post_bond_min_mcap numeric NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS post_bond_max_mcap numeric NOT NULL DEFAULT 40000,
  ADD COLUMN IF NOT EXISTS post_bond_dip_low numeric NOT NULL DEFAULT 7000,
  ADD COLUMN IF NOT EXISTS post_bond_dip_high numeric NOT NULL DEFAULT 12000,
  ADD COLUMN IF NOT EXISTS post_bond_dead_below numeric NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS post_bond_watch_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS post_bond_age_max_minutes integer NOT NULL DEFAULT 30;

-- Watch queue for post-bond dip-buy monitoring
CREATE TABLE IF NOT EXISTS public.alpha_watch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mint text NOT NULL UNIQUE,
  ticker text,
  dev_wallet text,
  kyc_root text,
  kyc_label text,
  match_kind text NOT NULL,
  reason text,
  source text,
  entry_mcap_seen numeric,
  min_mcap_seen numeric,
  max_mcap_seen numeric,
  last_mcap numeric,
  phase text NOT NULL DEFAULT 'watching_dump',
  status text NOT NULL DEFAULT 'active',
  resolution text,
  match_payload jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_checked_at timestamptz,
  check_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.alpha_watch_queue TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alpha_watch_queue TO authenticated;
GRANT ALL ON public.alpha_watch_queue TO service_role;
ALTER TABLE public.alpha_watch_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read alpha watch queue" ON public.alpha_watch_queue FOR SELECT USING (true);
CREATE POLICY "Service manages alpha watch queue" ON public.alpha_watch_queue FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_alpha_watch_status ON public.alpha_watch_queue (status, expires_at);

-- Track skip reasons on paper trades (for Rule 1 stale skips we still want an audit row optionally — but keeping it out of alpha_paper_trades to avoid noise).
-- Add stop-loss reason support (exit_reason already free-text, no schema change needed).
