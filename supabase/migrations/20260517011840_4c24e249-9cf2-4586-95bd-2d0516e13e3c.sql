ALTER TABLE public.x_account_registry
  ADD COLUMN IF NOT EXISTS followers_count BIGINT,
  ADD COLUMN IF NOT EXISTS followers_fetched_at TIMESTAMPTZ;