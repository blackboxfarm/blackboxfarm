-- Phase 1: Add ath_source and close_enough_threshold fields
-- Also add near_miss tracking fields and peak trailing stop fields

ALTER TABLE public.telegram_fantasy_positions
ADD COLUMN IF NOT EXISTS ath_source text DEFAULT 'historical',
ADD COLUMN IF NOT EXISTS close_enough_triggered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS near_miss_logged boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS near_miss_multiplier numeric,
ADD COLUMN IF NOT EXISTS near_miss_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_pct numeric DEFAULT 20,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_triggered boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.telegram_fantasy_positions.ath_source IS 'Source of ATH: historical (before position), observed (during position monitoring)';
COMMENT ON COLUMN public.telegram_fantasy_positions.close_enough_triggered IS 'True if sold via close-enough logic (e.g., 95% of target)';
COMMENT ON COLUMN public.telegram_fantasy_positions.near_miss_logged IS 'True if position reached 90%+ of target but did not hit';
COMMENT ON COLUMN public.telegram_fantasy_positions.peak_trailing_stop_enabled IS 'Enable trailing stop after reaching threshold multiplier';
COMMENT ON COLUMN public.telegram_fantasy_positions.peak_trailing_stop_pct IS 'Percentage drop from peak to trigger trailing stop sell';

-- Add config columns to telegram_channel_config for per-channel settings
ALTER TABLE public.telegram_channel_config
ADD COLUMN IF NOT EXISTS close_enough_threshold_pct numeric DEFAULT 95,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_threshold numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS peak_trailing_stop_pct numeric DEFAULT 20;

COMMENT ON COLUMN public.telegram_channel_config.close_enough_threshold_pct IS 'Trigger sell when reaching this % of target (e.g., 95 = 95%)';
COMMENT ON COLUMN public.telegram_channel_config.peak_trailing_stop_threshold IS 'Enable trailing stop after reaching this multiplier (e.g., 1.5x)';
COMMENT ON COLUMN public.telegram_channel_config.peak_trailing_stop_pct IS 'Percentage drop from peak to trigger trailing stop sell';