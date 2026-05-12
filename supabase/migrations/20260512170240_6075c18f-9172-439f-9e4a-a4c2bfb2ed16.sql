
ALTER TABLE public.holders_intel_post_queue
  ADD COLUMN IF NOT EXISTS dex_banner_url text,
  ADD COLUMN IF NOT EXISTS decorated_banner_url text,
  ADD COLUMN IF NOT EXISTS decoration_theme text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('holders-intel-banners', 'holders-intel-banners', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "HI banners public read" ON storage.objects;
CREATE POLICY "HI banners public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'holders-intel-banners');

DROP POLICY IF EXISTS "HI banners super admin write" ON storage.objects;
CREATE POLICY "HI banners super admin write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'holders-intel-banners'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "HI banners super admin update" ON storage.objects;
CREATE POLICY "HI banners super admin update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'holders-intel-banners'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "HI banners super admin delete" ON storage.objects;
CREATE POLICY "HI banners super admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'holders-intel-banners'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
