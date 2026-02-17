-- Add post-exit tracking columns for stop-loss recovery analysis
ALTER TABLE public.pumpfun_fantasy_positions
ADD COLUMN IF NOT EXISTS post_exit_price_usd double precision,
ADD COLUMN IF NOT EXISTS post_exit_mcap double precision,
ADD COLUMN IF NOT EXISTS post_exit_graduated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS post_exit_recovered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS post_exit_checked_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS post_exit_multiplier_vs_entry double precision;

-- Index for quick backcheck queries
CREATE INDEX IF NOT EXISTS idx_pumpfun_fantasy_stop_loss_backcheck 
ON public.pumpfun_fantasy_positions (exit_reason, post_exit_checked_at)
WHERE status = 'closed' AND exit_reason = 'stop_loss';