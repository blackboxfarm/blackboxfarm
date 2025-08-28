-- Move extensions from public schema to extensions schema
-- First check what extensions are in public schema
DO $$
DECLARE
    ext_record RECORD;
    schema_exists BOOLEAN;
BEGIN
    -- Check if extensions schema exists, create if not
    SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') INTO schema_exists;
    IF NOT schema_exists THEN
        CREATE SCHEMA IF NOT EXISTS extensions;
    END IF;
    
    -- Move any extensions from public to extensions schema
    FOR ext_record IN 
        SELECT e.extname 
        FROM pg_extension e 
        JOIN pg_namespace n ON e.extnamespace = n.oid 
        WHERE n.nspname = 'public'
    LOOP
        -- Skip core extensions that must remain in public
        IF ext_record.extname NOT IN ('plpgsql', 'citext', 'uuid-ossp', 'pgcrypto') THEN
            EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext_record.extname);
            RAISE NOTICE 'Moved extension % to extensions schema', ext_record.extname;
        END IF;
    END LOOP;
END $$;

-- Grant usage on extensions schema to authenticated users
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- For auth configuration, we'll need to use the dashboard
-- Create a comment to document the OTP expiry requirement
COMMENT ON SCHEMA public IS 'Note: OTP expiry should be configured in Supabase Auth settings to be <= 1 hour for security compliance';