-- Allow super admins to update any telegram channel config
CREATE POLICY "Super admins can update all configs"
ON telegram_channel_config
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- Also allow super admins to delete any config
CREATE POLICY "Super admins can delete all configs"
ON telegram_channel_config
FOR DELETE
USING (is_super_admin(auth.uid()));