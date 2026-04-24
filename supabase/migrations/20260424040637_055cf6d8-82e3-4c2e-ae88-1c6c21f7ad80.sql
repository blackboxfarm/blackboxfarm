ALTER TABLE public.social_media_gallery
ADD COLUMN IF NOT EXISTS related_article_id UUID REFERENCES public.intel_briefings(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS related_article_slug TEXT,
ADD COLUMN IF NOT EXISTS related_article_title TEXT,
ADD COLUMN IF NOT EXISTS related_article_label TEXT,
ADD COLUMN IF NOT EXISTS image_usage_context TEXT DEFAULT 'gallery';

CREATE INDEX IF NOT EXISTS idx_social_media_gallery_related_article_id
ON public.social_media_gallery(related_article_id);

CREATE INDEX IF NOT EXISTS idx_social_media_gallery_related_article_slug
ON public.social_media_gallery(related_article_slug);

CREATE INDEX IF NOT EXISTS idx_social_media_gallery_usage_context
ON public.social_media_gallery(image_usage_context);