-- 1. SuperAdmin SELECT policies on security tables
CREATE POLICY "SuperAdmins can view all security audit logs"
  ON public.security_audit_log FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "SuperAdmins can view all SMS alerts"
  ON public.security_sms_alerts FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "SuperAdmins can view all account lockdowns"
  ON public.account_lockdowns FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- 2. Trigger: log 2FA enable/disable events
CREATE OR REPLACE FUNCTION public.log_2fa_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_enabled = true THEN
    INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
    VALUES (NEW.user_id, '2FA_ENABLED', '2fa', jsonb_build_object('method', COALESCE(NEW.method, 'totp')));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_enabled = false AND NEW.is_enabled = true THEN
      INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
      VALUES (NEW.user_id, '2FA_ENABLED', '2fa', jsonb_build_object('method', COALESCE(NEW.method, 'totp')));
    ELSIF OLD.is_enabled = true AND NEW.is_enabled = false THEN
      INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
      VALUES (NEW.user_id, '2FA_DISABLED', '2fa', jsonb_build_object('method', COALESCE(NEW.method, 'totp')));
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.is_enabled = true THEN
    INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
    VALUES (OLD.user_id, '2FA_DISABLED', '2fa', jsonb_build_object('method', COALESCE(OLD.method, 'totp'), 'reason', 'deleted'));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_2fa_change ON public.user_2fa_secrets;
CREATE TRIGGER trg_log_2fa_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_2fa_secrets
  FOR EACH ROW EXECUTE FUNCTION public.log_2fa_change();

-- 3. Trigger: log account lockdown / unlock events
CREATE OR REPLACE FUNCTION public.log_account_lockdown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_locked = true THEN
    INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
    VALUES (NEW.user_id, 'LOCKDOWN', 'account_lockdowns',
      jsonb_build_object('reason', NEW.locked_reason, 'lockdown_id', NEW.id));
  ELSIF TG_OP = 'UPDATE' AND OLD.is_locked = true AND NEW.is_locked = false THEN
    INSERT INTO public.security_audit_log (user_id, event_type, table_name, details)
    VALUES (NEW.user_id, 'LOCKDOWN_RELEASED', 'account_lockdowns',
      jsonb_build_object('unlock_method', NEW.unlock_method, 'lockdown_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_account_lockdown ON public.account_lockdowns;
CREATE TRIGGER trg_log_account_lockdown
  AFTER INSERT OR UPDATE ON public.account_lockdowns
  FOR EACH ROW EXECUTE FUNCTION public.log_account_lockdown();