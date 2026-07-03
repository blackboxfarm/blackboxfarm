GRANT SELECT, INSERT, UPDATE, DELETE ON public.waterfall_wallets TO authenticated;
GRANT ALL ON public.waterfall_wallets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waterfall_cascade_runs TO authenticated;
GRANT ALL ON public.waterfall_cascade_runs TO service_role;