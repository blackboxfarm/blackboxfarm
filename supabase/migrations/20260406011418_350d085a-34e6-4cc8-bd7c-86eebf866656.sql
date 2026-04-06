
-- Security definer function to ban a user
CREATE OR REPLACE FUNCTION public.ban_user(target_user_id uuid, ban_until timestamptz DEFAULT '2099-12-31'::timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users 
  SET banned_until = ban_until,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- Security definer function to check if user is banned
CREATE OR REPLACE FUNCTION public.is_user_banned(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(banned_until > now(), false)
  FROM auth.users
  WHERE id = target_user_id;
$$;

-- Security definer function to unban a user
CREATE OR REPLACE FUNCTION public.unban_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users 
  SET banned_until = NULL,
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- Ban all farming accounts created April 4-5
DO $$
DECLARE
  r RECORD;
  cnt integer := 0;
BEGIN
  FOR r IN SELECT id FROM auth.users WHERE created_at >= '2026-04-04' AND created_at < '2026-04-06'
  LOOP
    UPDATE auth.users SET banned_until = '2099-12-31'::timestamptz, updated_at = now() WHERE id = r.id;
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Banned % accounts', cnt;
END;
$$;
