-- Add user-scoped RLS to wallet_backups table
-- This adds an extra layer so users can only access their own backups

-- Enable RLS if not already enabled
ALTER TABLE public.wallet_backups ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view their own wallet backups" ON public.wallet_backups;
DROP POLICY IF EXISTS "Users can create their own wallet backups" ON public.wallet_backups;
DROP POLICY IF EXISTS "Super admins can manage all wallet backups" ON public.wallet_backups;

-- Users can only view their own backups
CREATE POLICY "Users can view own wallet backups"
ON public.wallet_backups
FOR SELECT
USING (auth.uid() = created_by OR is_super_admin(auth.uid()));

-- Users can only create backups for themselves
CREATE POLICY "Users can create own wallet backups"
ON public.wallet_backups
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Only super admins can delete backups
CREATE POLICY "Super admins can delete wallet backups"
ON public.wallet_backups
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Add audit trigger for access logging
CREATE OR REPLACE FUNCTION public.log_wallet_backup_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        TG_OP || '_WALLET_BACKUP',
        'wallet_backups',
        auth.uid(),
        jsonb_build_object(
            'operation', TG_OP,
            'wallet_id', COALESCE(NEW.wallet_id, OLD.wallet_id),
            'backup_reason', COALESCE(NEW.backup_reason, OLD.backup_reason),
            'timestamp', now()
        )
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS audit_wallet_backup_access ON public.wallet_backups;
CREATE TRIGGER audit_wallet_backup_access
    AFTER INSERT OR UPDATE OR DELETE ON public.wallet_backups
    FOR EACH ROW
    EXECUTE FUNCTION public.log_wallet_backup_access();