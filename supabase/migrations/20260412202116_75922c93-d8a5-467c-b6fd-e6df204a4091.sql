
ALTER TABLE public.social_posts_log
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS hashtags text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS tags_mentions text,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS master_template_id uuid;

CREATE INDEX IF NOT EXISTS idx_social_posts_log_post_type ON public.social_posts_log (post_type);
CREATE INDEX IF NOT EXISTS idx_social_posts_log_master_template ON public.social_posts_log (master_template_id);
