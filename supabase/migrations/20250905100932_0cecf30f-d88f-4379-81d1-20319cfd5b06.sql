-- Check what extensions are in public schema  
SELECT n.nspname as schema_name, e.extname as extension_name
FROM pg_extension e 
JOIN pg_namespace n ON e.extnamespace = n.oid 
WHERE n.nspname = 'public';