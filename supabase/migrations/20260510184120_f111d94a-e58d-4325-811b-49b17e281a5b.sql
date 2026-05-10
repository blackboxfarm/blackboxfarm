CREATE TABLE IF NOT EXISTS public.kyc_discovery_log (
  id uuid primary key default gen_random_uuid(),
  dev_wallet text not null,
  kyc_wallet text not null,
  kyc_label text,
  kyc_source text,
  chain jsonb not null default '[]'::jsonb,
  chain_depth int not null default 0,
  tokens text[] not null default '{}',
  token_count int not null default 0,
  discovered_via text,
  discovered_at timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_discovery_log_dev_kyc_uq ON public.kyc_discovery_log(dev_wallet, kyc_wallet);
CREATE INDEX IF NOT EXISTS kyc_discovery_log_discovered_at_idx ON public.kyc_discovery_log(discovered_at DESC);
ALTER TABLE public.kyc_discovery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read kyc_discovery_log" ON public.kyc_discovery_log FOR SELECT
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));