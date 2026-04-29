
INSERT INTO storage.buckets (id, name, public)
VALUES ('autopsy-banners', 'autopsy-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Autopsy banners are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'autopsy-banners');
