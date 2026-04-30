CREATE POLICY "autopsy_backlog admin delete"
ON public.autopsy_backlog
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));