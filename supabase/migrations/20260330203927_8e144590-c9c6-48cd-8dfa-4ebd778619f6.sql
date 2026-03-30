CREATE POLICY "Allow anon insert to twitter-assets"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'twitter-assets');