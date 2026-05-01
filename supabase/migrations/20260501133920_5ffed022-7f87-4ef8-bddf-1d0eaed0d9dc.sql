-- token_boost_history: per-token, per-poll snapshot
CREATE TABLE IF NOT EXISTS public.token_boost_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  chain_id TEXT NOT NULL DEFAULT 'solana',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  boost_amount INTEGER,
  total_amount INTEGER,
  delta_amount INTEGER,
  source TEXT NOT NULL,
  icon_url TEXT,
  header_url TEXT,
  description TEXT,
  links JSONB,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_boost_history_unique
  ON public.token_boost_history (token_mint, source, captured_at);

CREATE INDEX IF NOT EXISTS idx_token_boost_history_mint_time
  ON public.token_boost_history (token_mint, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_boost_history_delta
  ON public.token_boost_history (captured_at DESC)
  WHERE delta_amount IS NOT NULL AND delta_amount > 0;

ALTER TABLE public.token_boost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Boost history readable by authenticated"
  ON public.token_boost_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Boost history writable by service role"
  ON public.token_boost_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- token_paid_orders: per-token paid order events from /orders/v1/{chain}/{mint}
CREATE TABLE IF NOT EXISTS public.token_paid_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL,
  chain_id TEXT NOT NULL DEFAULT 'solana',
  order_type TEXT NOT NULL,
  status TEXT,
  amount NUMERIC,
  payment_timestamp TIMESTAMPTZ,
  raw JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_paid_orders_unique
  ON public.token_paid_orders (token_mint, order_type, COALESCE(payment_timestamp, captured_at));

CREATE INDEX IF NOT EXISTS idx_token_paid_orders_mint
  ON public.token_paid_orders (token_mint, payment_timestamp DESC);

ALTER TABLE public.token_paid_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Paid orders readable by authenticated"
  ON public.token_paid_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Paid orders writable by service role"
  ON public.token_paid_orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);