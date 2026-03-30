-- Allow public read access to post queue (posted entries only) for /feed page
CREATE POLICY "Public can read posted entries"
  ON public.holders_intel_post_queue
  FOR SELECT
  TO anon, authenticated
  USING (status = 'posted');

-- Allow public read access to seen tokens for health grades/images on /feed
CREATE POLICY "Public can read seen tokens"
  ON public.holders_intel_seen_tokens
  FOR SELECT
  TO anon, authenticated
  USING (true);