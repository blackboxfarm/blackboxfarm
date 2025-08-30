-- Check for any existing functions that might reference referral_code ambiguously
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_definition ILIKE '%referral_code%' 
AND routine_schema = 'public';

-- Also check for any triggers that might be causing issues
SELECT trigger_name, action_statement, event_manipulation, event_object_table
FROM information_schema.triggers 
WHERE trigger_schema = 'public';