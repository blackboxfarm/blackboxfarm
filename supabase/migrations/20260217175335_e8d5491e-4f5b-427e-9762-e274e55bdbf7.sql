
-- Phase 5: Add config toggles for ATH/downtrend hard gates
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS block_below_ath_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS block_below_ath_pct numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS block_downtrend_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS block_downtrend_pct numeric DEFAULT 5;

-- Add loss tracking columns to dev_wallet_reputation (for Phase 1 feedback loop)
ALTER TABLE public.dev_wallet_reputation
ADD COLUMN IF NOT EXISTS fantasy_loss_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fantasy_win_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_fantasy_loss_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_fantasy_win_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS auto_blacklisted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_blacklisted_at timestamptz DEFAULT NULL;

-- Add min_qualification_score column if not exists (referenced in code but might be missing)
ALTER TABLE public.pumpfun_monitor_config
ADD COLUMN IF NOT EXISTS min_qualification_score integer DEFAULT 50;
