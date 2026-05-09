-- Lock down DELETE/UPDATE on shared image buckets to admins/super admins.
-- Anyone authenticated previously could delete arbitrary files.

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%social-gallery%delete%' OR
        policyname ILIKE '%social_gallery%delete%' OR
        policyname ILIKE '%style-references%delete%' OR
        policyname ILIKE '%style_references%delete%' OR
        policyname ILIKE '%announcement-images%delete%' OR
        policyname ILIKE '%announcement_images%delete%' OR
        policyname ILIKE '%announcement-images%update%' OR
        policyname ILIKE '%announcement_images%update%' OR
        policyname ILIKE 'Authenticated users can delete%' OR
        policyname ILIKE 'Authenticated users can update announcement%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- DELETE: admins/super admins only
CREATE POLICY "admins delete social-gallery"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'social-gallery'
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "admins delete style-references"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'style-references'
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "admins delete announcement-images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'announcement-images'
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

-- UPDATE on announcement-images: admins/super admins only
CREATE POLICY "admins update announcement-images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'announcement-images'
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
)
WITH CHECK (
  bucket_id = 'announcement-images'
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);