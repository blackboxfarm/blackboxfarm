
-- Aftercare verdict enum
DO $$ BEGIN
  CREATE TYPE public.aftercare_verdict AS ENUM ('pending','reinforcing','cooling','exit','graduated','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Post-alert monitoring table
CREATE TABLE IF NOT EXISTS public.allstar_alert_watch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.allstar_mint_alerts(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  allstar_id UUID,
  creator_wallet TEXT,
  allstar_tier INTEGER,

  -- Snapshot at the moment of original alert (baseline for delta scoring)
  baseline_mcap NUMERIC,
  baseline_liquidity NUMERIC,
  baseline_volume_24h NUMERIC,
  baseline_holder_count INTEGER,
  baseline_price NUMERIC,
  baseline_captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Latest snapshot
  current_mcap NUMERIC,
  current_liquidity NUMERIC,
  current_volume_24h NUMERIC,
  current_holder_count INTEGER,
  current_price NUMERIC,

  -- Verdict state machine
  verdict public.aftercare_verdict NOT NULL DEFAULT 'pending',
  verdict_score INTEGER,                     -- -100 (exit) ... 0 (cool) ... +100 (reinforce)
  verdict_reasons JSONB DEFAULT '[]'::jsonb,  -- structured signals that fed the verdict
  dissent_score INTEGER,                      -- 0-100 from dissent-classify
  last_check_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_count INTEGER NOT NULL DEFAULT 0,
  decay_stage TEXT NOT NULL DEFAULT 'hot',    -- hot|warm|cool|tail
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  closed_at TIMESTAMPTZ,
  close_reason TEXT,

  -- Re-alert tracking
  reinforce_alerts_sent INTEGER NOT NULL DEFAULT 0,
  exit_alert_sent_at TIMESTAMPTZ,
  last_realert_at TIMESTAMPTZ,

  -- Audit trail
  history JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS allstar_alert_watch_alert_id_unique ON public.allstar_alert_watch(alert_id);
CREATE INDEX IF NOT EXISTS allstar_alert_watch_token_mint_idx ON public.allstar_alert_watch(token_mint);
CREATE INDEX IF NOT EXISTS allstar_alert_watch_next_check_idx ON public.allstar_alert_watch(next_check_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS allstar_alert_watch_verdict_idx ON public.allstar_alert_watch(verdict) WHERE closed_at IS NULL;

-- RLS: signed-in users read; only service role writes
ALTER TABLE public.allstar_alert_watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read alert watch" ON public.allstar_alert_watch;
CREATE POLICY "Authenticated can read alert watch"
  ON public.allstar_alert_watch
  FOR SELECT
  TO authenticated
  USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_allstar_alert_watch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_allstar_alert_watch_touch ON public.allstar_alert_watch;
CREATE TRIGGER trg_allstar_alert_watch_touch
  BEFORE UPDATE ON public.allstar_alert_watch
  FOR EACH ROW EXECUTE FUNCTION public.touch_allstar_alert_watch();
