ALTER TABLE public.launcher_profiles
  ADD COLUMN IF NOT EXISTS excluded_wallets text[] NOT NULL DEFAULT '{}';