-- Drop the existing trigger and recreate the function properly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the handle_new_user function with fully qualified column names
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
  
  -- Create referral program for new user with fully qualified table name
  INSERT INTO public.referral_programs (user_id, referral_code)
  VALUES (NEW.id, public.generate_referral_code(NEW.id));
  
  -- If user signed up with a referral code, track it
  -- Use NEW.raw_user_meta_data to avoid ambiguity
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

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();