ALTER TABLE public.social_media_gallery
  ADD COLUMN IF NOT EXISTS is_breadcrumb boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_social_media_gallery_is_breadcrumb
  ON public.social_media_gallery (is_breadcrumb) WHERE is_breadcrumb = true;