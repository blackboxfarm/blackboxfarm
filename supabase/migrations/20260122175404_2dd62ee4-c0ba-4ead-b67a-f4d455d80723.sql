-- Create OG storage bucket for Open Graph images
INSERT INTO storage.buckets (id, name, public)
VALUES ('OG', 'OG', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to OG images
CREATE POLICY "OG images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'OG');