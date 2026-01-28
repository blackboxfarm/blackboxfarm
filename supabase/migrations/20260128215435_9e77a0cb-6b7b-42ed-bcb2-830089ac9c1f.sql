-- Add INSERT policy for OG bucket (super admins only)
CREATE POLICY "Super admins can upload OG images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'OG' AND is_super_admin(auth.uid()));

-- Add UPDATE policy for OG bucket (super admins only)
CREATE POLICY "Super admins can update OG images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'OG' AND is_super_admin(auth.uid()));

-- Add DELETE policy for OG bucket (super admins only)
CREATE POLICY "Super admins can delete OG images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'OG' AND is_super_admin(auth.uid()));