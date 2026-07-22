GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waterfall_wallets TO authenticated;
GRANT ALL ON TABLE public.waterfall_wallets TO service_role;

-- Keep this table private: no anon grant.