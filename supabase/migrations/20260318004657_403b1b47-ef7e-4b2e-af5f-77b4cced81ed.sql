
-- RPC function to atomically increment monthly_quota_used on api_service_config
CREATE OR REPLACE FUNCTION public.increment_monthly_quota_used(
  p_service_name text,
  p_credits int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE api_service_config
  SET monthly_quota_used = COALESCE(monthly_quota_used, 0) + p_credits,
      last_request_at = now(),
      success_count_today = COALESCE(success_count_today, 0) + 1,
      updated_at = now()
  WHERE service_name = p_service_name;
$$;
