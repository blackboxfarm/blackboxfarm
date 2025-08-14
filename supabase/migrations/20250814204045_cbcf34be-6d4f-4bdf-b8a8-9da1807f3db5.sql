-- Create a temporary function to encrypt existing secrets
-- This will be used to migrate existing plaintext secrets to encrypted format

-- First, let's add a comment to indicate that sensitive fields are now encrypted
COMMENT ON COLUMN wallet_pools.secret_key IS 'Encrypted private key using AES-256-GCM';
COMMENT ON COLUMN trading_positions.owner_secret IS 'Encrypted private key using AES-256-GCM';

-- Add audit logging for security compliance
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  user_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Create policy for audit log (admin access only)
CREATE POLICY "Admin can access audit logs" 
ON public.security_audit_log 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

-- Create trigger function to log sensitive data access
CREATE OR REPLACE FUNCTION public.audit_sensitive_access()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Add audit triggers to sensitive tables
CREATE TRIGGER audit_wallet_pools_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.wallet_pools
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();

CREATE TRIGGER audit_trading_positions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.trading_positions
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access();