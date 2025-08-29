-- Fix the ambiguous referral_code column issue by updating any problematic functions/triggers

-- First, let's check what triggers exist on auth.users
SELECT 
  t.trigger_name,
  t.event_manipulation,
  t.action_statement
FROM information_schema.triggers t
WHERE t.event_object_table = 'users'
AND t.trigger_schema = 'auth';

-- Also check if there are any functions that might have ambiguous referral_code references
-- and fix them by properly qualifying the table names