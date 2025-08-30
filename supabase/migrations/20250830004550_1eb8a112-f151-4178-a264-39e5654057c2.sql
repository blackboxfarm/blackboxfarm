-- Drop all existing triggers and functions related to user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create a new clean function with no ambiguous references
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
    new_user_id UUID := NEW.id;
    user_referral_code TEXT;
BEGIN
    -- Insert into profiles table
    INSERT INTO public.profiles (user_id, display_name, email_verified)
    VALUES (
        new_user_id, 
        NEW.raw_user_meta_data ->> 'display_name',
        NEW.email_confirmed_at IS NOT NULL
    );
    
    -- Generate and create referral program for new user
    INSERT INTO public.referral_programs (user_id, referral_code)
    VALUES (new_user_id, public.generate_referral_code(new_user_id));
    
    -- Check if user signed up with a referral code
    user_referral_code := NEW.raw_user_meta_data ->> 'referral_code';
    
    IF user_referral_code IS NOT NULL AND user_referral_code != '' THEN
        PERFORM public.track_referral_signup(user_referral_code, new_user_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();