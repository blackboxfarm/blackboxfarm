-- Grant super_admin role to testuser@blackbox.farm
-- If the user already has the role, ensure it is active

-- Safety: confirm the app_role includes 'super_admin' (no-op if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin'
  ) THEN
    -- Add the enum value at the end (safe if not present)
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- Upsert the role for the target user by email
WITH target_user AS (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'testuser@blackbox.farm'
  LIMIT 1
)
INSERT INTO public.user_roles (user_id, role, is_active)
SELECT id, 'super_admin'::public.app_role, true
FROM target_user
ON CONFLICT (user_id, role)
DO UPDATE SET is_active = EXCLUDED.is_active;