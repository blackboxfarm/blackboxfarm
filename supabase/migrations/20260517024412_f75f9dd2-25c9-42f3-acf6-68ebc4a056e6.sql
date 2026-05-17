ALTER TABLE public.allstar_mint_alerts
  ADD COLUMN IF NOT EXISTS is_suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppressed_reason text;

CREATE INDEX IF NOT EXISTS idx_allstar_mint_alerts_suppressed
  ON public.allstar_mint_alerts (is_suppressed, created_at DESC);

COMMENT ON COLUMN public.allstar_mint_alerts.is_suppressed IS
  'true = alert kept in queue but NOT broadcast (e.g. Mayhem launches). UI shows a "Not Announced" badge with suppressed_reason.';