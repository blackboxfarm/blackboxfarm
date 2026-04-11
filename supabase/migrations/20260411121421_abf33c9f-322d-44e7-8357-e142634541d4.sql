CREATE POLICY "Super admins can delete audit runs"
ON public.telegram_channel_audit_runs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete audit members"
ON public.telegram_channel_member_audit
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));