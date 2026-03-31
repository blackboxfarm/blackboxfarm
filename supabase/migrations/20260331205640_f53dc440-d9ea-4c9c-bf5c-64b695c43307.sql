
-- Create intel_briefings table
CREATE TABLE public.intel_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  subtitle text,
  content_md text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  tags text[] DEFAULT '{}',
  author text NOT NULL DEFAULT 'BlackBox Research',
  featured_image_url text,
  seo_title text,
  seo_description text,
  related_slugs text[] DEFAULT '{}',
  published_at timestamptz DEFAULT now(),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.intel_briefings ENABLE ROW LEVEL SECURITY;

-- Public can read published articles
CREATE POLICY "Anyone can read published briefings"
  ON public.intel_briefings
  FOR SELECT
  USING (is_published = true);

-- Super admins can read all (including drafts)
CREATE POLICY "Super admins can read all briefings"
  ON public.intel_briefings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Super admins can insert
CREATE POLICY "Super admins can insert briefings"
  ON public.intel_briefings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Super admins can update
CREATE POLICY "Super admins can update briefings"
  ON public.intel_briefings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Super admins can delete
CREATE POLICY "Super admins can delete briefings"
  ON public.intel_briefings
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for slug lookups
CREATE INDEX idx_intel_briefings_slug ON public.intel_briefings (slug);

-- Index for published listing
CREATE INDEX idx_intel_briefings_published ON public.intel_briefings (is_published, published_at DESC);

-- Index for category filtering
CREATE INDEX idx_intel_briefings_category ON public.intel_briefings (category) WHERE is_published = true;
