-- Check what extensions are in public schema
SELECT schemaname, extname 
FROM pg_extension e 
JOIN pg_namespace n ON e.extnamespace = n.oid 
WHERE n.nspname = 'public';