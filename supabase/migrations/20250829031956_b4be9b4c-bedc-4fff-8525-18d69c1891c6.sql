-- Create a migration to enhance the database with additional security features

-- Create a function to log authentication failures with enhanced details
CREATE OR REPLACE FUNCTION public.log_auth_failure(
  user_email text,
  failure_reason text,
  client_info jsonb DEFAULT '{}'::jsonb
)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check for suspicious activity patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_activity(
  check_ip inet,
  time_window_minutes integer DEFAULT 60
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a table for storing rate limiting data
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL, -- IP address, user_id, etc.
  action_type text NOT NULL, -- 'auth_attempt', 'api_call', etc.
  attempt_count integer DEFAULT 1,
  first_attempt timestamp with time zone DEFAULT now(),
  last_attempt timestamp with time zone DEFAULT now(),
  is_blocked boolean DEFAULT false,
  blocked_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(identifier, action_type)
);

-- Enable RLS on rate_limits table
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Create policy for rate_limits (only service role can access)
CREATE POLICY "Service role can manage rate limits" 
ON public.rate_limits 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create trigger for rate_limits updated_at
CREATE TRIGGER update_rate_limits_updated_at
BEFORE UPDATE ON public.rate_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a function to manage rate limiting
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  check_identifier text,
  check_action_type text,
  max_attempts integer DEFAULT 5,
  window_minutes integer DEFAULT 15
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a table for storing security configurations
CREATE TABLE IF NOT EXISTS public.security_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key text UNIQUE NOT NULL,
  config_value jsonb NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security_config
ALTER TABLE public.security_config ENABLE ROW LEVEL SECURITY;

-- Create policy for security_config (only service role can access)
CREATE POLICY "Service role can manage security config" 
ON public.security_config 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create trigger for security_config updated_at
CREATE TRIGGER update_security_config_updated_at
BEFORE UPDATE ON public.security_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default security configurations
INSERT INTO public.security_config (config_key, config_value, description) VALUES
('auth_rate_limit', '{"max_attempts": 5, "window_minutes": 15}', 'Rate limiting for authentication attempts'),
('session_timeout', '{"hours": 24}', 'Session timeout configuration'),
('password_policy', '{"min_length": 8, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_special": false}', 'Password policy requirements'),
('suspicious_activity_threshold', '{"failed_attempts": 5, "unique_emails": 3, "time_window_minutes": 60}', 'Thresholds for detecting suspicious activity')
ON CONFLICT (config_key) DO NOTHING;

-- Create a function to get security configuration
CREATE OR REPLACE FUNCTION public.get_security_config(config_key_param text)
RETURNS jsonb AS $$
DECLARE
  config_value jsonb;
BEGIN
  SELECT sc.config_value INTO config_value
  FROM public.security_config sc
  WHERE sc.config_key = config_key_param 
    AND sc.is_active = true;
  
  RETURN COALESCE(config_value, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;