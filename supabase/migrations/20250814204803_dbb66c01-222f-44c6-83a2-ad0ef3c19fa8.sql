-- Fix security warnings

-- 1. Fix function search path mutable issue
-- Update the audit function to have a proper search_path setting
CREATE OR REPLACE FUNCTION public.audit_sensitive_access()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, 
    table_name, 
    user_id, 
    details
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    auth.uid(),
    jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'affected_record_id', COALESCE(NEW.id, OLD.id)
    )
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;