CREATE POLICY "Allow public read access to developer_tokens"
ON public.developer_tokens
FOR SELECT
TO anon, authenticated
USING (true);