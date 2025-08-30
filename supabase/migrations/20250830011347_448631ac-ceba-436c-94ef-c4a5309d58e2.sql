-- Fix the generate_referral_code function to avoid ambiguous column references
CREATE OR REPLACE FUNCTION public.generate_referral_code(user_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_referral_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8 character alphanumeric code
        new_referral_code := upper(substr(md5(random()::text || user_id_param::text), 1, 8));
        
        -- Check if code already exists using fully qualified column reference
        SELECT EXISTS(SELECT 1 FROM public.referral_programs WHERE public.referral_programs.referral_code = new_referral_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_referral_code;
END;
$function$;

-- Fix the track_referral_signup function to avoid ambiguous references
CREATE OR REPLACE FUNCTION public.track_referral_signup(referral_code_param text, new_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    referrer_id UUID;
    result JSONB;
BEGIN
    -- Find referrer by code using fully qualified column reference
    SELECT public.referral_programs.user_id INTO referrer_id
    FROM public.referral_programs
    WHERE public.referral_programs.referral_code = referral_code_param;
    
    IF referrer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid referral code');
    END IF;
    
    IF referrer_id = new_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot refer yourself');
    END IF;
    
    -- Check if user was already referred
    IF EXISTS(SELECT 1 FROM public.referrals WHERE public.referrals.referred_user_id = new_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'User already referred');
    END IF;
    
    -- Create referral record
    INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code)
    VALUES (referrer_id, new_user_id, referral_code_param);
    
    -- Update referrals count
    UPDATE public.referral_programs 
    SET referrals_count = referrals_count + 1, updated_at = now()
    WHERE public.referral_programs.user_id = referrer_id;
    
    -- Create notification for referrer
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (
        referrer_id,
        'New Referral! 👥',
        'Someone signed up using your referral code. They need to create a campaign to count towards your reward.',
        'info',
        jsonb_build_object('referral_signup', true, 'referred_user', new_user_id)
    );
    
    RETURN jsonb_build_object('success', true, 'message', 'Referral tracked successfully');
END;
$function$;