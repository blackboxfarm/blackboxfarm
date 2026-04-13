CREATE TABLE public.fotobomb_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url text NOT NULL,
  page_name text,
  status text NOT NULL DEFAULT 'pending',
  total_photos_found integer DEFAULT 0,
  apify_run_id text,
  last_scraped_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.fotobomb_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES public.fotobomb_targets(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  thumbnail_url text,
  facebook_photo_id text,
  caption text,
  posted_at timestamptz,
  album_name text,
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_fotobomb_images_posted_at ON public.fotobomb_images(target_id, posted_at ASC);
CREATE INDEX idx_fotobomb_images_review ON public.fotobomb_images(target_id, review_status);

ALTER TABLE public.fotobomb_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotobomb_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage fotobomb targets"
  ON public.fotobomb_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage fotobomb images"
  ON public.fotobomb_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));