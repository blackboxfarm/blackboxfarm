ALTER TABLE public.dev_wallet_reputation 
  ADD COLUMN IF NOT EXISTS kolscan_handle text,
  ADD COLUMN IF NOT EXISTS kolscan_checked_at timestamptz;