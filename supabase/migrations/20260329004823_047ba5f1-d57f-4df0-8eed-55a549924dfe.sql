INSERT INTO storage.buckets (id, name, public)
VALUES ('repurposed-images', 'repurposed-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for repurposed images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'repurposed-images');

CREATE POLICY "Service role can upload repurposed images"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'repurposed-images');

CREATE POLICY "Service role can update repurposed images"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'repurposed-images');