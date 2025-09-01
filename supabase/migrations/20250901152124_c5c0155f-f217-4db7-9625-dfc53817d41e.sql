-- Check current triggers on super_admin_wallets
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'super_admin_wallets';

-- Let's examine the trigger_wallet_backup function to see if it's causing the issue
-- Drop and recreate it with the correct field reference for super_admin_wallets
DROP FUNCTION IF EXISTS public.trigger_wallet_backup() CASCADE;

CREATE OR REPLACE FUNCTION public.trigger_wallet_backup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    wallet_type_var TEXT;
    pubkey_var TEXT;
    secret_var TEXT;
    user_id_var UUID;
BEGIN
    -- Determine wallet type and extract data based on table
    IF TG_TABLE_NAME = 'super_admin_wallets' THEN
        wallet_type_var := 'super_admin';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key_encrypted;
        user_id_var := NEW.created_by; -- Use created_by for super_admin_wallets
    ELSIF TG_TABLE_NAME = 'blackbox_wallets' THEN
        wallet_type_var := 'blackbox';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key_encrypted;
        user_id_var := NEW.created_by;
    ELSIF TG_TABLE_NAME = 'wallet_pools' THEN
        wallet_type_var := 'pool';
        pubkey_var := NEW.pubkey;
        secret_var := NEW.secret_key;
        user_id_var := NEW.user_id; -- Use user_id for wallet_pools
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
            user_id_var
        );
        
        -- Log creation
        PERFORM public.log_wallet_operation(
            NEW.id,
            wallet_type_var,
            'create',
            user_id_var,
            true,
            NULL,
            jsonb_build_object('trigger', 'auto_backup', 'table', TG_TABLE_NAME)
        );
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trigger_wallet_backup_super_admin_wallets
    AFTER INSERT ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();