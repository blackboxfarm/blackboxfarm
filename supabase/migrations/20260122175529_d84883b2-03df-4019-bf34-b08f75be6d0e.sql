-- Make OG bucket public so /storage/v1/object/public/OG/... works
UPDATE storage.buckets
SET public = true
WHERE id = 'OG';

-- Ensure public read policy exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'OG images are publicly accessible'
  ) THEN
    EXECUTE 'CREATE POLICY "OG images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = ''OG'')';
  END IF;
END $$;