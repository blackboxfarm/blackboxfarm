-- Enhanced security measures for wallet storage and management
-- Add comprehensive audit logging, backup systems, and additional security layers

-- Create wallet backup table for redundancy
CREATE TABLE IF NOT EXISTS public.wallet_backups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL,
    wallet_type TEXT NOT NULL, -- 'super_admin', 'blackbox', 'pool'
    pubkey TEXT NOT NULL,
    secret_key_encrypted TEXT NOT NULL,
    backup_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    backup_reason TEXT NOT NULL DEFAULT 'automatic',
    created_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    verification_hash TEXT NOT NULL -- For integrity verification
);

-- Create wallet security audit table
CREATE TABLE IF NOT EXISTS public.wallet_security_audit (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL,
    wallet_type TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'create', 'access', 'backup', 'restore', 'encrypt', 'decrypt'
    user_id UUID,
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    security_flags JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.wallet_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_security_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for wallet backups (only service role access)
CREATE POLICY "Service role only wallet backups access" 
ON public.wallet_backups 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS policies for wallet security audit (only service role access)
CREATE POLICY "Service role only wallet security audit access" 
ON public.wallet_security_audit 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Enhanced wallet backup function
CREATE OR REPLACE FUNCTION public.create_wallet_backup(
    p_wallet_id UUID,
    p_wallet_type TEXT,
    p_pubkey TEXT,
    p_secret_encrypted TEXT,
    p_reason TEXT DEFAULT 'automatic',
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    backup_id UUID;
    verification_hash TEXT;
BEGIN
    -- Generate verification hash for integrity checking
    verification_hash := encode(sha256((p_pubkey || p_secret_encrypted || now()::text)::bytea), 'hex');
    
    -- Insert backup record
    INSERT INTO public.wallet_backups (
        wallet_id,
        wallet_type,
        pubkey,
        secret_key_encrypted,
        backup_reason,
        created_by,
        verification_hash
    ) VALUES (
        p_wallet_id,
        p_wallet_type,
        p_pubkey,
        p_secret_encrypted,
        p_reason,
        p_user_id,
        verification_hash
    ) RETURNING id INTO backup_id;
    
    -- Log the backup operation
    INSERT INTO public.wallet_security_audit (
        wallet_id,
        wallet_type,
        operation,
        user_id,
        success,
        security_flags
    ) VALUES (
        p_wallet_id,
        p_wallet_type,
        'backup',
        p_user_id,
        true,
        jsonb_build_object(
            'backup_id', backup_id,
            'verification_hash', verification_hash,
            'reason', p_reason
        )
    );
    
    RETURN backup_id;
END;
$function$;

-- Enhanced wallet security logging function
CREATE OR REPLACE FUNCTION public.log_wallet_operation(
    p_wallet_id UUID,
    p_wallet_type TEXT,
    p_operation TEXT,
    p_user_id UUID DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_security_flags JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
    INSERT INTO public.wallet_security_audit (
        wallet_id,
        wallet_type,
        operation,
        user_id,
        success,
        error_message,
        security_flags
    ) VALUES (
        p_wallet_id,
        p_wallet_type,
        p_operation,
        p_user_id,
        p_success,
        p_error_message,
        p_security_flags
    );
END;
$function$;

-- Create backup triggers for all wallet tables
CREATE OR REPLACE FUNCTION public.trigger_wallet_backup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    wallet_type_var TEXT;
    pubkey_var TEXT;
    secret_var TEXT;
BEGIN
    -- Determine wallet type and extract data based on table
    IF TG_TABLE_NAME = 'super_admin_wallets' THEN
        wallet_type_var := 'super_admin';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key_encrypted;
    ELSIF TG_TABLE_NAME = 'blackbox_wallets' THEN
        wallet_type_var := 'blackbox';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key_encrypted;
    ELSIF TG_TABLE_NAME = 'wallet_pools' THEN
        wallet_type_var := 'pool';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key;
    ELSE
        RETURN NEW;
    END IF;
    
    -- Create backup only for INSERT operations
    IF TG_OP = 'INSERT' THEN
        PERFORM public.create_wallet_backup(
            NEW.id,
            wallet_type_var,
            pubkey_var,
            secret_var,
            'automatic_on_create',
            COALESCE(NEW.created_by, NEW.user_id)
        );
        
        -- Log creation
        PERFORM public.log_wallet_operation(
            NEW.id,
            wallet_type_var,
            'create',
            COALESCE(NEW.created_by, NEW.user_id),
            true,
            NULL,
            jsonb_build_object('trigger', 'auto_backup', 'table', TG_TABLE_NAME)
        );
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Add backup triggers to all wallet tables
DROP TRIGGER IF EXISTS backup_super_admin_wallets ON public.super_admin_wallets;
CREATE TRIGGER backup_super_admin_wallets
    AFTER INSERT ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();

DROP TRIGGER IF EXISTS backup_blackbox_wallets ON public.blackbox_wallets;
CREATE TRIGGER backup_blackbox_wallets
    AFTER INSERT ON public.blackbox_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();

DROP TRIGGER IF EXISTS backup_wallet_pools ON public.wallet_pools;
CREATE TRIGGER backup_wallet_pools
    AFTER INSERT ON public.wallet_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();

-- Prevent deletion of wallet records (soft delete only)
CREATE OR REPLACE FUNCTION public.prevent_wallet_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
    -- Log deletion attempt
    PERFORM public.log_wallet_operation(
        OLD.id,
        CASE TG_TABLE_NAME 
            WHEN 'super_admin_wallets' THEN 'super_admin'
            WHEN 'blackbox_wallets' THEN 'blackbox'
            WHEN 'wallet_pools' THEN 'pool'
        END,
        'delete_attempt',
        auth.uid(),
        false,
        'Deletion prevented by security policy',
        jsonb_build_object('table', TG_TABLE_NAME, 'prevention_reason', 'permanent_storage_policy')
    );
    
    -- Instead of deleting, mark as inactive
    IF TG_TABLE_NAME IN ('super_admin_wallets', 'blackbox_wallets', 'wallet_pools') THEN
        UPDATE public.super_admin_wallets SET is_active = false WHERE id = OLD.id AND TG_TABLE_NAME = 'super_admin_wallets';
        UPDATE public.blackbox_wallets SET is_active = false WHERE id = OLD.id AND TG_TABLE_NAME = 'blackbox_wallets';
        UPDATE public.wallet_pools SET is_active = false WHERE id = OLD.id AND TG_TABLE_NAME = 'wallet_pools';
    END IF;
    
    -- Prevent the actual deletion
    RETURN NULL;
END;
$function$;

-- Add deletion prevention triggers
DROP TRIGGER IF EXISTS prevent_super_admin_wallet_deletion ON public.super_admin_wallets;
CREATE TRIGGER prevent_super_admin_wallet_deletion
    BEFORE DELETE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_wallet_deletion();

DROP TRIGGER IF EXISTS prevent_blackbox_wallet_deletion ON public.blackbox_wallets;
CREATE TRIGGER prevent_blackbox_wallet_deletion
    BEFORE DELETE ON public.blackbox_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_wallet_deletion();

DROP TRIGGER IF EXISTS prevent_wallet_pool_deletion ON public.wallet_pools;
CREATE TRIGGER prevent_wallet_pool_deletion
    BEFORE DELETE ON public.wallet_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_wallet_deletion();

-- Enhanced super admin wallet encryption trigger with additional security
CREATE OR REPLACE FUNCTION public.encrypt_super_admin_wallet_secrets_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
    -- Log access attempt
    PERFORM public.log_wallet_operation(
        COALESCE(NEW.id, gen_random_uuid()),
        'super_admin',
        CASE TG_OP WHEN 'INSERT' THEN 'create' ELSE 'update' END,
        auth.uid(),
        true,
        NULL,
        jsonb_build_object('operation', TG_OP, 'encrypted', true)
    );
    
    -- Encrypt secret_key_encrypted if it's not already encrypted
    IF NEW.secret_key_encrypted IS NOT NULL AND NEW.secret_key_encrypted !~ '^[A-Za-z0-9+/]*={0,2}$' THEN
        NEW.secret_key_encrypted = encrypt_wallet_secret(NEW.secret_key_encrypted);
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Update the trigger
DROP TRIGGER IF EXISTS encrypt_super_admin_wallet_secrets ON public.super_admin_wallets;
CREATE TRIGGER encrypt_super_admin_wallet_secrets
    BEFORE INSERT OR UPDATE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_super_admin_wallet_secrets_trigger();

-- Create wallet integrity verification function
CREATE OR REPLACE FUNCTION public.verify_wallet_integrity(p_wallet_id UUID, p_wallet_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    wallet_count INTEGER;
    backup_count INTEGER;
    latest_backup RECORD;
    result JSONB;
BEGIN
    -- Check if wallet exists in main table
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE id = $1', 
        CASE p_wallet_type 
            WHEN 'super_admin' THEN 'super_admin_wallets'
            WHEN 'blackbox' THEN 'blackbox_wallets'
            WHEN 'pool' THEN 'wallet_pools'
        END) 
    USING p_wallet_id INTO wallet_count;
    
    -- Check backup count
    SELECT COUNT(*) INTO backup_count
    FROM public.wallet_backups
    WHERE wallet_id = p_wallet_id AND wallet_type = p_wallet_type;
    
    -- Get latest backup
    SELECT * INTO latest_backup
    FROM public.wallet_backups
    WHERE wallet_id = p_wallet_id AND wallet_type = p_wallet_type
    ORDER BY backup_timestamp DESC
    LIMIT 1;
    
    result := jsonb_build_object(
        'wallet_exists', wallet_count > 0,
        'backup_count', backup_count,
        'has_backups', backup_count > 0,
        'latest_backup_timestamp', latest_backup.backup_timestamp,
        'verification_hash', latest_backup.verification_hash,
        'integrity_status', CASE 
            WHEN wallet_count > 0 AND backup_count > 0 THEN 'secure'
            WHEN wallet_count > 0 AND backup_count = 0 THEN 'warning_no_backup'
            WHEN wallet_count = 0 AND backup_count > 0 THEN 'recoverable'
            ELSE 'critical'
        END
    );
    
    RETURN result;
END;
$function$;