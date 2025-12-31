-- Add Scalp Mode columns to telegram_channel_config
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_mode_enabled boolean DEFAULT false;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_buy_amount_usd numeric DEFAULT 10;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_min_bonding_pct numeric DEFAULT 20;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_max_bonding_pct numeric DEFAULT 65;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_max_age_minutes integer DEFAULT 45;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_min_callers integer DEFAULT 1;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_caller_timeout_seconds integer DEFAULT 180;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_take_profit_pct numeric DEFAULT 50;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_moon_bag_pct numeric DEFAULT 10;
ALTER TABLE telegram_channel_config ADD COLUMN IF NOT EXISTS scalp_stop_loss_pct numeric DEFAULT 35;

-- Add Moon Bag tracking to flip_positions
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS is_scalp_position boolean DEFAULT false;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS moon_bag_enabled boolean DEFAULT false;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS moon_bag_percent numeric DEFAULT 10;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS partial_sells jsonb DEFAULT '[]';
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS original_quantity_tokens numeric;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS moon_bag_quantity_tokens numeric;
ALTER TABLE flip_positions ADD COLUMN IF NOT EXISTS scalp_stage text DEFAULT 'initial';

-- Create scalp_signal_tracker table for multi-source validation
CREATE TABLE IF NOT EXISTS scalp_signal_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  channel_id text NOT NULL,
  channel_name text,
  caller_username text,
  detected_at timestamptz DEFAULT now(),
  message_text text,
  bonding_curve_pct numeric,
  price_usd numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_mint, channel_id)
);

-- Enable RLS on scalp_signal_tracker
ALTER TABLE scalp_signal_tracker ENABLE ROW LEVEL SECURITY;

-- Create policy for scalp_signal_tracker (admin access)
CREATE POLICY "Allow all access to scalp_signal_tracker" ON scalp_signal_tracker FOR ALL USING (true);

-- Create indexes for scalp_signal_tracker
CREATE INDEX IF NOT EXISTS idx_scalp_signal_token ON scalp_signal_tracker(token_mint);
CREATE INDEX IF NOT EXISTS idx_scalp_signal_time ON scalp_signal_tracker(detected_at);
CREATE INDEX IF NOT EXISTS idx_scalp_signal_token_time ON scalp_signal_tracker(token_mint, detected_at);