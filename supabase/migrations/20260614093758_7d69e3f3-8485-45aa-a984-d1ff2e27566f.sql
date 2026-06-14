CREATE UNIQUE INDEX IF NOT EXISTS idx_token_paid_orders_upsert_conflict
  ON public.token_paid_orders (token_mint, order_type, payment_timestamp);