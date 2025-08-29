-- Create referral program tables and functions
CREATE TABLE public.referral_programs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    referral_code TEXT NOT NULL UNIQUE,
    referrals_count INTEGER NOT NULL DEFAULT 0,
    successful_referrals INTEGER NOT NULL DEFAULT 0,
    discount_earned BOOLEAN NOT NULL DEFAULT false,
    discount_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT referral_programs_user_id_unique UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;

-- Create policies for referral programs
CREATE POLICY "Users can manage their own referral program"
ON public.referral_programs
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create referrals table to track individual referrals
CREATE TABLE public.referrals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID NOT NULL,
    referred_user_id UUID NOT NULL,
    referral_code TEXT NOT NULL,
    campaign_created BOOLEAN NOT NULL DEFAULT false,
    reward_granted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT referrals_unique_referral UNIQUE(referred_user_id, referrer_id)
);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Create policies for referrals
CREATE POLICY "Users can view referrals they made or received"
ON public.referrals
FOR SELECT
USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY "System can manage referrals"
ON public.referrals
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code(user_id_param UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    referral_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8 character alphanumeric code
        referral_code := upper(substr(md5(random()::text || user_id_param::text), 1, 8));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM public.referral_programs WHERE referral_code = referral_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN referral_code;
END;
$$;

-- Function to create referral program for new user
CREATE OR REPLACE FUNCTION public.create_referral_program_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    new_referral_code TEXT;
BEGIN
    -- Generate unique referral code
    new_referral_code := public.generate_referral_code(NEW.user_id);
    
    -- Create referral program
    INSERT INTO public.referral_programs (user_id, referral_code)
    VALUES (NEW.user_id, new_referral_code);
    
    RETURN NEW;
END;
$$;

-- Create trigger to auto-create referral program when profile is created
CREATE TRIGGER create_referral_program_trigger
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.create_referral_program_for_user();

-- Function to process referral when campaign is created
CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    referrer_record public.referral_programs;
BEGIN
    -- Update the referral record to mark campaign as created
    UPDATE public.referrals 
    SET campaign_created = true, updated_at = now()
    WHERE referred_user_id = NEW.user_id AND campaign_created = false;
    
    -- Get referrer info and update their successful referrals count
    UPDATE public.referral_programs 
    SET successful_referrals = successful_referrals + 1,
        discount_earned = CASE WHEN successful_referrals + 1 >= 5 THEN true ELSE discount_earned END,
        updated_at = now()
    WHERE user_id IN (
        SELECT referrer_id FROM public.referrals 
        WHERE referred_user_id = NEW.user_id AND campaign_created = false
    )
    RETURNING * INTO referrer_record;
    
    -- Create notification if discount earned
    IF referrer_record.successful_referrals >= 5 AND NOT referrer_record.discount_used THEN
        INSERT INTO public.notifications (user_id, title, message, type, metadata)
        VALUES (
            referrer_record.user_id,
            'Referral Reward Earned! 🎉',
            'You have successfully referred 5 friends who created campaigns! You now have a 25% discount available for your next big campaign.',
            'success',
            jsonb_build_object(
                'referral_discount', true,
                'discount_percent', 25,
                'successful_referrals', referrer_record.successful_referrals
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to process referral rewards when campaigns are created
CREATE TRIGGER process_referral_reward_trigger
    AFTER INSERT ON public.blackbox_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.process_referral_reward();

-- Function to apply referral discount
CREATE OR REPLACE FUNCTION public.apply_referral_discount(user_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    referral_record public.referral_programs;
    discount_info JSONB;
BEGIN
    -- Get referral program info
    SELECT * INTO referral_record 
    FROM public.referral_programs 
    WHERE user_id = user_id_param;
    
    IF referral_record IS NULL THEN
        RETURN jsonb_build_object('has_discount', false, 'message', 'No referral program found');
    END IF;
    
    -- Check if discount is available
    IF referral_record.successful_referrals >= 5 AND NOT referral_record.discount_used THEN
        -- Mark discount as used
        UPDATE public.referral_programs 
        SET discount_used = true, updated_at = now()
        WHERE user_id = user_id_param;
        
        RETURN jsonb_build_object(
            'has_discount', true,
            'discount_percent', 25,
            'message', 'Referral discount applied successfully!'
        );
    ELSE
        RETURN jsonb_build_object(
            'has_discount', false,
            'successful_referrals', referral_record.successful_referrals,
            'discount_used', referral_record.discount_used,
            'message', CASE 
                WHEN referral_record.discount_used THEN 'Referral discount already used'
                ELSE 'Need ' || (5 - referral_record.successful_referrals) || ' more successful referrals'
            END
        );
    END IF;
END;
$$;

-- Function to track referral signup
CREATE OR REPLACE FUNCTION public.track_referral_signup(referral_code_param TEXT, new_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    referrer_id UUID;
    result JSONB;
BEGIN
    -- Find referrer by code
    SELECT user_id INTO referrer_id
    FROM public.referral_programs
    WHERE referral_code = referral_code_param;
    
    IF referrer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid referral code');
    END IF;
    
    IF referrer_id = new_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot refer yourself');
    END IF;
    
    -- Check if user was already referred
    IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_user_id = new_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'User already referred');
    END IF;
    
    -- Create referral record
    INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code)
    VALUES (referrer_id, new_user_id, referral_code_param);
    
    -- Update referrals count
    UPDATE public.referral_programs 
    SET referrals_count = referrals_count + 1, updated_at = now()
    WHERE user_id = referrer_id;
    
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
$$;

-- Add update trigger for updated_at columns
CREATE TRIGGER update_referral_programs_updated_at
    BEFORE UPDATE ON public.referral_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referrals_updated_at
    BEFORE UPDATE ON public.referrals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();