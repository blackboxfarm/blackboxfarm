-- Fix remaining functions with search path mutable warnings

CREATE OR REPLACE FUNCTION public.create_referral_program_for_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.process_referral_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.log_auth_failure(user_email text, failure_reason text, client_info jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    table_name,
    user_id,
    details,
    ip_address
  ) VALUES (
    'AUTH_FAILURE',
    'auth_attempts',
    NULL, -- No user_id for failed attempts
    jsonb_build_object(
      'email', user_email,
      'reason', failure_reason,
      'timestamp', now(),
      'client_info', client_info
    ),
    (client_info ->> 'ip')::inet
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_referral_discount(user_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- Generate and create referral program for new user (only if one doesn't exist)
    INSERT INTO public.referral_programs (user_id, referral_code)
    VALUES (new_user_id, public.generate_referral_code(new_user_id))
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Check if user signed up with a referral code
    user_referral_code := NEW.raw_user_meta_data ->> 'referral_code';
    
    IF user_referral_code IS NOT NULL AND user_referral_code != '' THEN
        PERFORM public.track_referral_signup(user_referral_code, new_user_id);
    END IF;
    
    RETURN NEW;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.create_blackbox_campaign_on_first_contribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_blackbox_campaign_id UUID;
BEGIN
    -- Create blackbox campaign when current_funding_sol > 0 and no blackbox campaign exists yet
    IF NEW.current_funding_sol > 0 AND OLD.current_funding_sol = 0 AND NEW.blackbox_campaign_id IS NULL THEN
        -- Create a new blackbox campaign
        INSERT INTO public.blackbox_campaigns (
            user_id,
            nickname,
            token_address,
            is_active
        ) VALUES (
            NEW.creator_id,
            NEW.title || ' (Community)',
            NEW.token_address,
            true
        ) RETURNING id INTO new_blackbox_campaign_id;
        
        -- Link the community campaign to the blackbox campaign
        UPDATE public.community_campaigns 
        SET blackbox_campaign_id = new_blackbox_campaign_id
        WHERE id = NEW.id;
        
        -- Create notification for the campaign creator
        INSERT INTO public.notifications (user_id, title, message, type, metadata)
        VALUES (
            NEW.creator_id,
            'Trading Campaign Created! 🚀',
            'Your community campaign "' || NEW.title || '" has received funding and a trading campaign has been created. You can now configure and start trading.',
            'success',
            jsonb_build_object(
                'community_campaign_id', NEW.id,
                'blackbox_campaign_id', new_blackbox_campaign_id,
                'funding_amount', NEW.current_funding_sol
            )
        );
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.track_campaign_state_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    timing_record public.campaign_timing;
    state_change JSONB;
    runtime_minutes INTEGER;
BEGIN
    -- Determine if this is blackbox or community campaign
    state_change := jsonb_build_object(
        'timestamp', now(),
        'from_active', COALESCE(OLD.is_active, false),
        'to_active', NEW.is_active,
        'trigger', 'manual'
    );
    
    -- Get or create timing record
    SELECT * INTO timing_record
    FROM public.campaign_timing
    WHERE campaign_id = NEW.id::text
    AND campaign_type = TG_ARGV[0];
    
    IF timing_record IS NULL THEN
        -- Create new timing record
        INSERT INTO public.campaign_timing (
            campaign_id,
            campaign_type,
            started_at,
            state_changes
        ) VALUES (
            NEW.id::text,
            TG_ARGV[0],
            CASE WHEN NEW.is_active THEN now() ELSE NULL END,
            jsonb_build_array(state_change)
        );
    ELSE
        -- Update existing timing record
        IF NEW.is_active AND NOT COALESCE(OLD.is_active, false) THEN
            -- Campaign started/restarted
            timing_record.started_at := now();
            timing_record.paused_at := NULL;
        ELSIF NOT NEW.is_active AND COALESCE(OLD.is_active, false) THEN
            -- Campaign paused
            timing_record.paused_at := now();
            
            -- Calculate runtime if we have a start time
            IF timing_record.started_at IS NOT NULL THEN
                runtime_minutes := EXTRACT(epoch FROM (now() - timing_record.started_at)) / 60;
                timing_record.total_runtime_minutes := timing_record.total_runtime_minutes + runtime_minutes;
            END IF;
        END IF;
        
        -- Append state change to history
        timing_record.state_changes := timing_record.state_changes || jsonb_build_array(state_change);
        
        -- Update the record
        UPDATE public.campaign_timing
        SET 
            started_at = timing_record.started_at,
            paused_at = timing_record.paused_at,
            total_runtime_minutes = timing_record.total_runtime_minutes,
            state_changes = timing_record.state_changes,
            updated_at = now()
        WHERE id = timing_record.id;
    END IF;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_notification_cooldown(p_campaign_id text, p_campaign_type text, p_hours integer DEFAULT 1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    last_notification TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT MAX(sent_at) INTO last_notification
    FROM public.campaign_notifications
    WHERE campaign_id = p_campaign_id::uuid
    AND campaign_type = p_campaign_type
    AND notification_type IN ('manual_start', 'manual_restart');
    
    -- If no previous notification or cooldown period has passed
    RETURN (last_notification IS NULL OR last_notification < (now() - (p_hours || ' hours')::interval));
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_suspicious_activity(check_ip inet, time_window_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  failed_attempts integer;
  unique_emails integer;
  result jsonb;
BEGIN
  -- Count failed attempts from this IP in the time window
  SELECT COUNT(*), COUNT(DISTINCT details ->> 'email')
  INTO failed_attempts, unique_emails
  FROM public.security_audit_log
  WHERE ip_address = check_ip
    AND event_type = 'AUTH_FAILURE'
    AND created_at > (now() - (time_window_minutes || ' minutes')::interval);
  
  result := jsonb_build_object(
    'is_suspicious', failed_attempts >= 5 OR unique_emails >= 3,
    'failed_attempts', failed_attempts,
    'unique_emails_attempted', unique_emails,
    'risk_level', 
      CASE 
        WHEN failed_attempts >= 10 THEN 'high'
        WHEN failed_attempts >= 5 OR unique_emails >= 3 THEN 'medium'
        WHEN failed_attempts >= 3 THEN 'low'
        ELSE 'none'
      END
  );
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_subscription(user_id_param uuid)
 RETURNS TABLE(id uuid, tier_name text, trades_used integer, max_trades_per_hour integer, expires_at timestamp with time zone, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    us.id,
    pt.tier_name,
    us.trades_used,
    pt.max_trades_per_hour,
    us.expires_at,
    us.is_active
  FROM public.user_subscriptions us
  JOIN public.pricing_tiers pt ON us.pricing_tier_id = pt.id
  WHERE us.user_id = user_id_param 
    AND us.is_active = true
    AND (us.expires_at IS NULL OR us.expires_at > now())
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(check_identifier text, check_action_type text, max_attempts integer DEFAULT 5, window_minutes integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_record public.rate_limits;
  is_blocked boolean := false;
  attempts_remaining integer;
  reset_time timestamp with time zone;
BEGIN
  -- Get or create rate limit record
  SELECT * INTO current_record
  FROM public.rate_limits
  WHERE identifier = check_identifier 
    AND action_type = check_action_type;
  
  IF current_record IS NULL THEN
    -- Create new record
    INSERT INTO public.rate_limits (identifier, action_type)
    VALUES (check_identifier, check_action_type)
    RETURNING * INTO current_record;
  ELSE
    -- Check if we should reset the counter (outside time window)
    IF current_record.first_attempt < (now() - (window_minutes || ' minutes')::interval) THEN
      -- Reset counter
      UPDATE public.rate_limits
      SET attempt_count = 1,
          first_attempt = now(),
          last_attempt = now(),
          is_blocked = false,
          blocked_until = NULL
      WHERE id = current_record.id
      RETURNING * INTO current_record;
    ELSE
      -- Increment counter
      UPDATE public.rate_limits
      SET attempt_count = attempt_count + 1,
          last_attempt = now(),
          is_blocked = (attempt_count + 1) >= max_attempts,
          blocked_until = CASE 
            WHEN (attempt_count + 1) >= max_attempts 
            THEN (now() + (window_minutes || ' minutes')::interval)
            ELSE NULL
          END
      WHERE id = current_record.id
      RETURNING * INTO current_record;
    END IF;
  END IF;
  
  -- Calculate response data
  attempts_remaining := GREATEST(0, max_attempts - current_record.attempt_count);
  reset_time := COALESCE(current_record.blocked_until, current_record.first_attempt + (window_minutes || ' minutes')::interval);
  
  RETURN jsonb_build_object(
    'is_blocked', current_record.is_blocked,
    'attempts_used', current_record.attempt_count,
    'attempts_remaining', attempts_remaining,
    'reset_time', reset_time,
    'window_minutes', window_minutes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_security_config(config_key_param text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  config_value jsonb;
BEGIN
  SELECT sc.config_value INTO config_value
  FROM public.security_config sc
  WHERE sc.config_key = config_key_param 
    AND sc.is_active = true;
  
  RETURN COALESCE(config_value, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_security_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    result JSONB;
    extension_count INTEGER;
    public_extensions TEXT[];
BEGIN
    -- Count extensions in public schema
    SELECT COUNT(*), array_agg(extname)
    INTO extension_count, public_extensions
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE n.nspname = 'public';
    
    -- Build status report
    result := jsonb_build_object(
        'extensions_in_public', extension_count,
        'public_extensions', public_extensions,
        'security_note', 'System extensions (pg_net, etc.) must remain in public schema',
        'recommendation', 'Configure OTP expiry via Supabase dashboard for remaining warning',
        'timestamp', now()
    );
    
    -- Log security status check
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'SECURITY_STATUS_CHECK',
        'system_security',
        auth.uid(),
        result
    );
    
    RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.monitor_extension_changes()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Log any extension-related DDL commands
    INSERT INTO public.security_audit_log (
        event_type,
        table_name,
        user_id,
        details
    ) VALUES (
        'EXTENSION_DDL_COMMAND',
        'pg_extension',
        auth.uid(),
        jsonb_build_object(
            'command_tag', tg_tag,
            'timestamp', now(),
            'note', 'Extension operation detected'
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_positions_with_secrets(session_id_param uuid)
 RETURNS TABLE(id uuid, session_id uuid, lot_id text, entry_price numeric, high_price numeric, quantity_raw bigint, quantity_ui numeric, entry_timestamp timestamp with time zone, owner_pubkey text, owner_secret text, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        tp.id,
        tp.session_id,
        tp.lot_id,
        tp.entry_price,
        tp.high_price,
        tp.quantity_raw,
        tp.quantity_ui,
        tp.entry_timestamp,
        tp.owner_pubkey,
        decrypt_owner_secret(tp.owner_secret) as owner_secret,
        tp.status,
        tp.created_at,
        tp.updated_at
    FROM trading_positions tp
    WHERE tp.session_id = session_id_param 
    AND tp.status = 'active';
END;
$function$;