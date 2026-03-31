-- Gallery style categories (dynamic/configurable)
CREATE TABLE public.gallery_style_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#f97316',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.gallery_style_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read style categories" ON public.gallery_style_categories FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage style categories" ON public.gallery_style_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default categories
INSERT INTO public.gallery_style_categories (name, description, color, sort_order) VALUES
  ('Brand', 'Official brand imagery and logos', '#f97316', 1),
  ('Character #1', 'Primary mascot / character style', '#8b5cf6', 2),
  ('Character #2', 'Secondary character style', '#06b6d4', 3);

-- Main gallery images table
CREATE TABLE public.social_media_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  display_name text NOT NULL,
  file_url text NOT NULL,
  thumbnail_url text,
  source_type text NOT NULL DEFAULT 'uploaded' CHECK (source_type IN ('uploaded', 'ai_generated')),
  tags text[] DEFAULT '{}',
  style_category_ids uuid[] DEFAULT '{}',
  ai_prompt text,
  ai_model text,
  width int,
  height int,
  file_size_bytes bigint,
  mime_type text,
  used_in_posts uuid[] DEFAULT '{}',
  last_used_at timestamptz,
  use_count int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.social_media_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read gallery" ON public.social_media_gallery FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage gallery" ON public.social_media_gallery FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for gallery uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('social-gallery', 'social-gallery', true);

CREATE POLICY "Public read social-gallery" ON storage.objects FOR SELECT USING (bucket_id = 'social-gallery');
CREATE POLICY "Authenticated upload social-gallery" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'social-gallery');
CREATE POLICY "Authenticated delete social-gallery" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'social-gallery');