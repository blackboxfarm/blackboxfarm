
CREATE TABLE public.platform_health_mode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medium text NOT NULL UNIQUE CHECK (medium IN ('telegram_bot', 'holders_page', 'x_posts')),
  use_ai boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.platform_health_mode ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (edge functions need this)
CREATE POLICY "Authenticated users can read health mode" ON public.platform_health_mode
  FOR SELECT TO authenticated USING (true);

-- Only super admins can update
CREATE POLICY "Super admins can update health mode" ON public.platform_health_mode
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can insert health mode" ON public.platform_health_mode
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed all three mediums with AI mode ON by default
INSERT INTO public.platform_health_mode (medium, use_ai) VALUES
  ('telegram_bot', true),
  ('holders_page', true),
  ('x_posts', true);

-- Also allow anon to read (edge functions use service role but just in case)
CREATE POLICY "Anon can read health mode" ON public.platform_health_mode
  FOR SELECT TO anon USING (true);
