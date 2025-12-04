-- Add auto-sell configuration columns to mega_whale_auto_buy_config
ALTER TABLE public.mega_whale_auto_buy_config
ADD COLUMN IF NOT EXISTS auto_sell_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS take_profit_pct numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS stop_loss_pct numeric DEFAULT 30,
ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS trailing_stop_pct numeric DEFAULT 20;

-- Create position tracking table
CREATE TABLE IF NOT EXISTS public.mega_whale_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  config_id uuid REFERENCES public.mega_whale_auto_buy_config(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.mega_whale_auto_trades(id) ON DELETE SET NULL,
  token_mint text NOT NULL,
  token_symbol text,
  amount_tokens numeric NOT NULL,
  entry_price_sol numeric NOT NULL,
  current_price_sol numeric,
  high_price_sol numeric,
  pnl_percent numeric DEFAULT 0,
  pnl_sol numeric DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open', 'sold', 'stopped_out', 'take_profit', 'failed')),
  sell_signature text,
  sell_price_sol numeric,
  sell_amount_sol numeric,
  opened_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  last_checked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mega_whale_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own positions"
ON public.mega_whale_positions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own positions"
ON public.mega_whale_positions FOR ALL
USING (auth.uid() = user_id);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_mega_whale_positions_status ON public.mega_whale_positions(status);
CREATE INDEX IF NOT EXISTS idx_mega_whale_positions_user ON public.mega_whale_positions(user_id);

-- Schedule cron job to monitor positions every 30 seconds
SELECT cron.schedule(
  'mega-whale-position-monitor-cron',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/mega-whale-position-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action', 'monitor_all')
  );
  $$
);