ALTER TABLE public.no_lube_global_profile
  ADD COLUMN IF NOT EXISTS backlog_max_age_min numeric NOT NULL DEFAULT 30;