-- Phase 5: Global Safeguards

-- Add kill switch and global safeguard columns to config
ALTER TABLE pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS kill_switch_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kill_switch_activated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS kill_switch_reason TEXT,
ADD COLUMN IF NOT EXISTS min_rolling_win_rate NUMERIC DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS win_rate_lookback_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS daily_buys_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_daily_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS active_watchdog_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_prune_at TIMESTAMP WITH TIME ZONE;

-- Create a table to track daily statistics for win rate calculation
CREATE TABLE IF NOT EXISTS pumpfun_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_buys INTEGER DEFAULT 0,
  successful_sells INTEGER DEFAULT 0,
  failed_sells INTEGER DEFAULT 0,
  total_profit_sol NUMERIC DEFAULT 0,
  total_loss_sol NUMERIC DEFAULT 0,
  net_pnl_sol NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  tokens_discovered INTEGER DEFAULT 0,
  tokens_rejected INTEGER DEFAULT 0,
  tokens_bought INTEGER DEFAULT 0,
  tokens_sold INTEGER DEFAULT 0,
  kill_switch_triggers INTEGER DEFAULT 0,
  prune_events INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(stat_date)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_pumpfun_daily_stats_date ON pumpfun_daily_stats(stat_date DESC);

-- Add safeguard tracking columns to watchlist
ALTER TABLE pumpfun_watchlist
ADD COLUMN IF NOT EXISTS pruned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS prune_reason TEXT,
ADD COLUMN IF NOT EXISTS priority_score NUMERIC DEFAULT 50;

-- Create index for priority-based pruning
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_priority ON pumpfun_watchlist(priority_score ASC) 
WHERE status = 'watching';

-- Enable RLS
ALTER TABLE pumpfun_daily_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (admin-only feature)
CREATE POLICY "Allow all access to pumpfun_daily_stats"
ON pumpfun_daily_stats FOR ALL
USING (true)
WITH CHECK (true);

-- Insert today's stats row if not exists
INSERT INTO pumpfun_daily_stats (stat_date)
VALUES (CURRENT_DATE)
ON CONFLICT (stat_date) DO NOTHING;