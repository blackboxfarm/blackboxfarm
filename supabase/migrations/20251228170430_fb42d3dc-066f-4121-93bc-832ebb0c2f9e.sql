-- Add FlipIt auto-buy settings to telegram_channel_config
ALTER TABLE public.telegram_channel_config
ADD COLUMN IF NOT EXISTS flipit_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flipit_buy_amount_usd numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS flipit_sell_multiplier numeric DEFAULT 2,
ADD COLUMN IF NOT EXISTS flipit_max_daily_positions integer DEFAULT 5;

-- Add global FlipIt defaults table
CREATE TABLE IF NOT EXISTS public.flipit_global_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_buy_amount_usd numeric DEFAULT 10,
  default_sell_multiplier numeric DEFAULT 2,
  default_max_daily_positions integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Insert default global config
INSERT INTO public.flipit_global_config (default_buy_amount_usd, default_sell_multiplier, default_max_daily_positions)
VALUES (10, 2, 5)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.flipit_global_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read global config
CREATE POLICY "Allow read global config" ON public.flipit_global_config
FOR SELECT USING (true);

-- Allow authenticated users to update global config (admin check done in app)
CREATE POLICY "Allow authenticated update" ON public.flipit_global_config
FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Add index for daily position counting
CREATE INDEX IF NOT EXISTS idx_flip_positions_wallet_created 
ON public.flip_positions (wallet_id, created_at);

-- Add source tracking to flip_positions
ALTER TABLE public.flip_positions
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS source_channel_id text;