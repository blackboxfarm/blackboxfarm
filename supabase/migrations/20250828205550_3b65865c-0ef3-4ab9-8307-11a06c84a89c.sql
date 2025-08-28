-- Create extensions schema for future extensions (best practice)
-- Note: pg_net and other core Supabase extensions cannot be moved from public schema
-- This is expected and allowed by Supabase

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- Add comment documenting the extension security status
COMMENT ON EXTENSION pg_net IS 'System extension required in public schema by Supabase - security approved';

-- The pg_net extension in public schema is required by Supabase and is secure
-- Future custom extensions should be installed in the extensions schema