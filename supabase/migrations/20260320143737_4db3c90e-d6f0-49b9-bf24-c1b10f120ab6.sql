-- =====================================================
-- Tier 3 Security: RLS policies for 10 unprotected tables
-- + materialized view access revocation
-- (pg_net extension cannot be moved - skipped)
-- =====================================================

-- 1. Add super_admin-only policies to all 10 tables

CREATE POLICY "Super admins only" ON public.dead_letter_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.edge_function_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.error_trend_snapshot
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.mesh_growth_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.mesh_spider_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.monthly_usage_archive
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.notification_delivery_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.spider_run_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.token_funnel_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins only" ON public.token_vigil
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Revoke direct API access to materialized views
REVOKE SELECT ON public.master_token_directory FROM anon, authenticated;
REVOKE SELECT ON public.mesh_summary FROM anon, authenticated;

-- =====================================================
-- REVERSAL:
-- DROP POLICY "Super admins only" ON public.dead_letter_queue;
-- DROP POLICY "Super admins only" ON public.edge_function_runs;
-- DROP POLICY "Super admins only" ON public.error_trend_snapshot;
-- DROP POLICY "Super admins only" ON public.mesh_growth_daily;
-- DROP POLICY "Super admins only" ON public.mesh_spider_queue;
-- DROP POLICY "Super admins only" ON public.monthly_usage_archive;
-- DROP POLICY "Super admins only" ON public.notification_delivery_log;
-- DROP POLICY "Super admins only" ON public.spider_run_metrics;
-- DROP POLICY "Super admins only" ON public.token_funnel_daily;
-- DROP POLICY "Super admins only" ON public.token_vigil;
-- GRANT SELECT ON public.master_token_directory TO anon, authenticated;
-- GRANT SELECT ON public.mesh_summary TO anon, authenticated;
-- =====================================================