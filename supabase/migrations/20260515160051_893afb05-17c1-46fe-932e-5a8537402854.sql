
-- 1. twitter-assets: remove anon insert
DROP POLICY IF EXISTS "Allow anon insert to twitter-assets" ON storage.objects;

-- 2. admin buckets: restrict INSERT to admins (matches existing DELETE/UPDATE pattern)
DROP POLICY IF EXISTS "Authenticated upload social-gallery" ON storage.objects;
CREATE POLICY "admins upload social-gallery"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'social-gallery'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "announcement images authenticated upload" ON storage.objects;
CREATE POLICY "admins upload announcement-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-images'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

-- style-references may already lack an auth-insert policy; add admin-only insert if absent
DROP POLICY IF EXISTS "Authenticated upload style-references" ON storage.objects;
DROP POLICY IF EXISTS "style-references authenticated upload" ON storage.objects;
CREATE POLICY "admins upload style-references"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'style-references'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

-- 3. email_tracking_events: drop anon insert; service_role policy already exists
DROP POLICY IF EXISTS "Anon can insert tracking events" ON public.email_tracking_events;
