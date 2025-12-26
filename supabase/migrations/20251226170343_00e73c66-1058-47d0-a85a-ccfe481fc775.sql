-- Fix incomplete super admin policies on tables that only have SELECT

-- telegram_channel_calls - add UPDATE/DELETE (already has SELECT and UPDATE, missing DELETE)
CREATE POLICY "Super admins can delete calls" ON public.telegram_channel_calls
FOR DELETE USING (public.is_super_admin(auth.uid()));

-- developer_alerts - add UPDATE/DELETE
CREATE POLICY "Super admins can update all alerts"
ON public.developer_alerts
FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete all alerts"
ON public.developer_alerts
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- invalid_scraped_tokens - add UPDATE/DELETE
CREATE POLICY "Super admins can update invalid tokens"
ON public.invalid_scraped_tokens
FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete invalid tokens"
ON public.invalid_scraped_tokens
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- banner_impressions - add UPDATE/DELETE (view-only is probably fine, but adding for consistency)
CREATE POLICY "Super admins can delete impressions"
ON public.banner_impressions
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- banner_clicks - add DELETE
CREATE POLICY "Super admins can delete clicks"
ON public.banner_clicks
FOR DELETE
USING (public.is_super_admin(auth.uid()));