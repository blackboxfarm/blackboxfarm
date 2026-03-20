
-- Fix 1: stripe_customers — Drop dangerous public ALL policy (exposes PII)
DROP POLICY "Service role full access on stripe_customers" ON public.stripe_customers;

-- Fix 2: token_vigil — Drop dangerous public ALL policy (publicly writable)
DROP POLICY "Service role full access vigil" ON public.token_vigil;

-- Fix 3: telegram_monitor_run_logs — Restrict SELECT to super_admins only
DROP POLICY "Super admins can read monitor run logs" ON public.telegram_monitor_run_logs;
CREATE POLICY "Super admins can read monitor run logs" ON public.telegram_monitor_run_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Also tighten the INSERT/UPDATE policies from {public} to {authenticated}
DROP POLICY "Super admins can insert monitor run logs" ON public.telegram_monitor_run_logs;
CREATE POLICY "Super admins can insert monitor run logs" ON public.telegram_monitor_run_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY "Super admins can update monitor run logs" ON public.telegram_monitor_run_logs;
CREATE POLICY "Super admins can update monitor run logs" ON public.telegram_monitor_run_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
