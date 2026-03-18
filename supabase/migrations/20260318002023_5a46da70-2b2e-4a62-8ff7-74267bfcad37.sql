
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_usage_archive_service_month_key') THEN
    ALTER TABLE public.monthly_usage_archive ADD CONSTRAINT monthly_usage_archive_service_month_key UNIQUE (service_name, month_year);
  END IF;
END $$;
