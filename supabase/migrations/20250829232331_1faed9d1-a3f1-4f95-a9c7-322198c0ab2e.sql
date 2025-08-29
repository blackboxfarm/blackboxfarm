-- Fix the handle_new_user function that has ambiguous referral_code column reference

-- First check current function definition
SELECT pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'handle_new_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Fix the function to properly qualify table names and handle Google OAuth provider
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  -- Insert into profiles table
  INSERT INTO public.profiles (user_id, display_name, email_verified)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.email_confirmed_at IS NOT NULL
  );
  
  -- Create referral program for new user (with proper table qualification)
  INSERT INTO public.referral_programs (user_id, referral_code)
  VALUES (NEW.id, public.generate_referral_code(NEW.id));
  
  -- If user signed up with a referral code, track it
  IF NEW.raw_user_meta_data ? 'referral_code' AND 
     NEW.raw_user_meta_data ->> 'referral_code' IS NOT NULL AND
     NEW.raw_user_meta_data ->> 'referral_code' != '' THEN
    
    PERFORM public.track_referral_signup(
      NEW.raw_user_meta_data ->> 'referral_code',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;