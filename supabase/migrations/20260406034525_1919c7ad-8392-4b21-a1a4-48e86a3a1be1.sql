CREATE TABLE public.installer_x_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  telegram_username TEXT,
  x_username TEXT,
  x_url TEXT,
  x_display_name TEXT,
  x_followers INTEGER,
  x_bio TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.installer_x_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on installer_x_profiles"
  ON public.installer_x_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read installer_x_profiles"
  ON public.installer_x_profiles
  FOR SELECT
  TO authenticated
  USING (true);