-- Check and fix any remaining triggers that reference user_id for super_admin_wallets
-- Drop all triggers on super_admin_wallets to ensure clean state
DROP TRIGGER IF EXISTS trigger_wallet_backup_super_admin_wallets ON public.super_admin_wallets;
DROP TRIGGER IF EXISTS encrypt_super_admin_wallet_secrets ON public.super_admin_wallets;
DROP TRIGGER IF EXISTS prevent_wallet_deletion_super_admin_wallets ON public.super_admin_wallets;
DROP TRIGGER IF EXISTS audit_super_admin_wallets ON public.super_admin_wallets;
DROP TRIGGER IF EXISTS log_sensitive_access_super_admin_wallets ON public.super_admin_wallets;

-- Recreate only the essential triggers with correct field references
CREATE TRIGGER encrypt_super_admin_wallet_secrets
    BEFORE INSERT OR UPDATE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_super_admin_wallet_secrets_trigger();

CREATE TRIGGER trigger_wallet_backup_super_admin_wallets
    AFTER INSERT ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();

CREATE TRIGGER prevent_wallet_deletion_super_admin_wallets
    BEFORE DELETE ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_wallet_deletion();