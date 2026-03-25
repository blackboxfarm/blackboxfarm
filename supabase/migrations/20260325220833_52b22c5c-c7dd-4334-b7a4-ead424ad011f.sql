-- Fix: Update profiles.email_verified when user confirms their email
-- Currently it's only set at signup time and never updated

CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
    SET email_verified = true,
        updated_at = now()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.sync_email_verified();

-- Backfill: fix any existing users who verified but profiles still show false
UPDATE public.profiles p
SET email_verified = true, updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified = false;