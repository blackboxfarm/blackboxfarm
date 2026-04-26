
-- Add trail_end_reason to dev_wallet_reputation so the genealogy backfill
-- can skip wallets that already terminated successfully (hit_cex) or
-- terminally failed (cycle_detected, depth_cap with no hope of progress).
ALTER TABLE public.dev_wallet_reputation
  ADD COLUMN IF NOT EXISTS trail_end_reason text,
  ADD COLUMN IF NOT EXISTS trail_end_kyc_root text,
  ADD COLUMN IF NOT EXISTS trail_end_at timestamp with time zone;

-- Index for fast "needs retrace" queries
CREATE INDEX IF NOT EXISTS idx_dev_wallet_rep_trail_end
  ON public.dev_wallet_reputation (trail_end_reason)
  WHERE trail_end_reason IS NOT NULL;
