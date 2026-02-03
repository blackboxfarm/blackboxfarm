-- Update handle_new_user to call admin-notify via pg_net using service role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_user_id UUID := NEW.id;
    user_referral_code TEXT;
    provider_name TEXT;
    identity_data JSONB;
    full_name TEXT;
    avatar TEXT;
    username TEXT;
    supabase_url TEXT := 'https://apxauapuusmgwbbzjgfl.supabase.co';
    service_key TEXT;
BEGIN
    -- Get the primary provider
    provider_name := NEW.raw_app_meta_data ->> 'provider';
    
    -- Extract identity data from OAuth provider
    IF NEW.raw_user_meta_data IS NOT NULL THEN
        identity_data := NEW.raw_user_meta_data;
        full_name := COALESCE(
            identity_data ->> 'full_name',
            identity_data ->> 'name',
            identity_data ->> 'display_name'
        );
        avatar := COALESCE(
            identity_data ->> 'avatar_url',
            identity_data ->> 'picture'
        );
        username := COALESCE(
            identity_data ->> 'user_name',
            identity_data ->> 'preferred_username',
            identity_data ->> 'screen_name'
        );
    END IF;
    
    -- Insert into profiles table with OAuth data
    INSERT INTO public.profiles (
        user_id, 
        display_name, 
        avatar_url,
        email_verified,
        oauth_provider,
        oauth_provider_id,
        oauth_username,
        oauth_full_name,
        oauth_raw_data
    )
    VALUES (
        new_user_id, 
        COALESCE(full_name, NEW.raw_user_meta_data ->> 'display_name'),
        avatar,
        NEW.email_confirmed_at IS NOT NULL,
        provider_name,
        identity_data ->> 'provider_id',
        username,
        full_name,
        identity_data
    );
    
    -- Generate and create referral program for new user
    INSERT INTO public.referral_programs (user_id, referral_code)
    VALUES (new_user_id, public.generate_referral_code(new_user_id))
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Check if user signed up with a referral code
    user_referral_code := NEW.raw_user_meta_data ->> 'referral_code';
    
    IF user_referral_code IS NOT NULL AND user_referral_code != '' THEN
        PERFORM public.track_referral_signup(user_referral_code, new_user_id);
    END IF;
    
    -- Insert notification directly into admin_notifications table
    -- This is more reliable than calling edge function from trigger
    INSERT INTO public.admin_notifications (
        notification_type,
        title,
        message,
        metadata
    ) VALUES (
        'new_signup',
        'New Account Created',
        'A new user has registered!' || E'\n\n' ||
        '📧 Email: ' || COALESCE(NEW.email, 'N/A') || E'\n' ||
        '👤 Name: ' || COALESCE(full_name, 'Not provided') || E'\n' ||
        '🔐 Provider: ' || COALESCE(provider_name, 'email') || E'\n' ||
        CASE WHEN username IS NOT NULL THEN '🐦 Username: @' || username ELSE '' END,
        jsonb_build_object(
            'user_id', new_user_id,
            'email', NEW.email,
            'provider', provider_name,
            'display_name', full_name,
            'username', username,
            'avatar_url', avatar
        )
    );
    
    -- Also trigger async notification to Telegram via pg_net
    -- Get service role key from vault if available
    BEGIN
        SELECT decrypted_secret INTO service_key 
        FROM vault.decrypted_secrets 
        WHERE name = 'service_role_key' 
        LIMIT 1;
        
        IF service_key IS NOT NULL THEN
            PERFORM net.http_post(
                url := supabase_url || '/functions/v1/admin-notify',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || service_key
                ),
                body := jsonb_build_object(
                    'type', 'new_signup',
                    'title', 'New Account Created',
                    'message', COALESCE(full_name, 'New user') || ' signed up via ' || COALESCE(provider_name, 'email') || E'\nEmail: ' || NEW.email,
                    'metadata', jsonb_build_object(
                        'user_id', new_user_id,
                        'email', NEW.email,
                        'provider', provider_name,
                        'display_name', full_name,
                        'username', username
                    ),
                    'channels', ARRAY['telegram']::text[]
                )
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Silently ignore if vault is not accessible or HTTP fails
        -- The database notification was already inserted
        NULL;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;