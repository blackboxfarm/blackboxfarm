-- Allow authenticated users to read scraper_audit_log
CREATE POLICY "Authenticated users can read scraper_audit_log"
ON public.scraper_audit_log
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to read scraper_provider_config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_provider_config' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read scraper_provider_config" ON public.scraper_provider_config FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- Allow authenticated users to update scraper_provider_config (for toggle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_provider_config' AND cmd = 'UPDATE'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can update scraper_provider_config" ON public.scraper_provider_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;