-- Fix the function search path security warnings by setting proper search_path

-- Fix log_auth_failure function
CREATE OR REPLACE FUNCTION public.log_auth_failure(
  user_email text,
  failure_reason text,
  client_info jsonb DEFAULT '{}'::jsonb
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix check_suspicious_activity function
CREATE OR REPLACE FUNCTION public.check_suspicious_activity(
  check_ip inet,
  time_window_minutes integer DEFAULT 60
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix check_rate_limit function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  check_identifier text,
  check_action_type text,
  max_attempts integer DEFAULT 5,
  window_minutes integer DEFAULT 15
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix get_security_config function
CREATE OR REPLACE FUNCTION public.get_security_config(config_key_param text)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
DECLARE
  config_value jsonb;
BEGIN
  SELECT sc.config_value INTO config_value
  FROM public.security_config sc
  WHERE sc.config_key = config_key_param 
    AND sc.is_active = true;
  
  RETURN COALESCE(config_value, '{}'::jsonb);
END;
$$;