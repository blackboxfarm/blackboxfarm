-- Check for the specific trigger that's causing the issue
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname IN ('create_referral_program_for_user', 'process_referral_reward', 'track_referral_signup');

-- Also check the generate_referral_code function
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'generate_referral_code';