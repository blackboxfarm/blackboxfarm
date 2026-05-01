-- Public bucket for announcement attachments (Telegram pulls the image by URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  10485760, -- 10MB (Telegram sendPhoto by URL limit is 5MB, by upload 10MB)
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read so Telegram servers can fetch the image
DROP POLICY IF EXISTS "announcement images public read" ON storage.objects;
CREATE POLICY "announcement images public read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'announcement-images');

-- Authenticated users (admins access this UI) can upload
DROP POLICY IF EXISTS "announcement images authenticated upload" ON storage.objects;
CREATE POLICY "announcement images authenticated upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'announcement-images');

-- Authenticated users can update/delete their own uploads
DROP POLICY IF EXISTS "announcement images authenticated update" ON storage.objects;
CREATE POLICY "announcement images authenticated update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "announcement images authenticated delete" ON storage.objects;
CREATE POLICY "announcement images authenticated delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'announcement-images');