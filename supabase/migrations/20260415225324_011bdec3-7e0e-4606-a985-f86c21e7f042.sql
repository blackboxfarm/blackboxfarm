
-- RPC function for the Accounts directory (super admin only)
CREATE OR REPLACE FUNCTION public.get_accounts_directory()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  oauth_provider text,
  cached_tier_key text,
  cached_subscription_active boolean,
  created_at timestamptz,
  last_active_at timestamptz,
  email_verified boolean,
  has_telegram boolean,
  telegram_username text,
  login_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    au.email::text,
    p.display_name,
    p.oauth_provider,
    COALESCE(p.cached_tier_key, 'free') AS cached_tier_key,
    COALESCE(p.cached_subscription_active, false) AS cached_subscription_active,
    p.created_at,
    p.last_active_at,
    EXISTS(
      SELECT 1 FROM email_verifications ev
      WHERE ev.user_id = p.user_id AND ev.verified_at IS NOT NULL
    ) AS email_verified,
    (tlc.telegram_user_id IS NOT NULL) AS has_telegram,
    tlc.telegram_username,
    COALESCE(p.login_count, 0) AS login_count
  FROM profiles p
  JOIN auth.users au ON au.id = p.user_id
  LEFT JOIN telegram_link_codes tlc ON tlc.user_id = p.user_id AND tlc.telegram_user_id IS NOT NULL
  WHERE EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  )
  ORDER BY p.created_at DESC;
$$;
