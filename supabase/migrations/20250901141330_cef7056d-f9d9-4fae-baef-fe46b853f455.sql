-- Fix the trigger that's causing the user_id field error
-- The trigger is trying to reference NEW.user_id but should reference NEW.created_by

-- Drop and recreate the trigger function to use correct field names
DROP TRIGGER IF EXISTS trigger_wallet_backup_super_admin_wallets ON public.super_admin_wallets;
DROP TRIGGER IF EXISTS trigger_wallet_backup_on_super_admin_wallets ON public.super_admin_wallets;

-- Update the trigger function to handle the correct field names for super_admin_wallets
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
            -- Use the correct field based on table
            CASE 
                WHEN TG_TABLE_NAME = 'super_admin_wallets' THEN NEW.created_by
                WHEN TG_TABLE_NAME = 'blackbox_wallets' THEN NEW.created_by
                WHEN TG_TABLE_NAME = 'wallet_pools' THEN NEW.user_id
                ELSE NULL
            END
        );
        
        -- Log creation
        PERFORM public.log_wallet_operation(
            NEW.id,
            wallet_type_var,
            'create',
            CASE 
                WHEN TG_TABLE_NAME = 'super_admin_wallets' THEN NEW.created_by
                WHEN TG_TABLE_NAME = 'blackbox_wallets' THEN NEW.created_by
                WHEN TG_TABLE_NAME = 'wallet_pools' THEN NEW.user_id
                ELSE NULL
            END,
            true,
            NULL,
            jsonb_build_object('trigger', 'auto_backup', 'table', TG_TABLE_NAME)
        );
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Recreate the trigger for super_admin_wallets
CREATE TRIGGER trigger_wallet_backup_super_admin_wallets
    AFTER INSERT ON public.super_admin_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_wallet_backup();