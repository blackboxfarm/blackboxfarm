
-- Add activity stats and subscription display columns to existing profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_session_minutes NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS feature_usage JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS cached_tier_key TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS cached_subscription_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cached_subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS member_since TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS referral_source TEXT;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_cached_tier ON public.profiles(cached_tier_key);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles(last_active_at DESC);

-- Update existing RLS: admins can view all, users see own
-- First drop old policies
DROP POLICY IF EXISTS "Secure profile view access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile update access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile insert access" ON public.profiles;

-- Self + admin read
CREATE POLICY "Users view own profile or admin views all"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin')
);

-- Self update only
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Self insert (trigger handles this, but just in case)
CREATE POLICY "Users insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to sync subscription cache into profile (called from webhook)
CREATE OR REPLACE FUNCTION public.sync_profile_subscription_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    cached_tier_key = NEW.tier_key,
    cached_subscription_active = NEW.is_active,
    cached_subscription_expires_at = NEW.expires_at,
    updated_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Trigger: when web_user_subscriptions changes, sync to profile
DROP TRIGGER IF EXISTS sync_sub_to_profile ON public.web_user_subscriptions;
CREATE TRIGGER sync_sub_to_profile
  AFTER INSERT OR UPDATE ON public.web_user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_subscription_cache();

-- Function to track login activity
CREATE OR REPLACE FUNCTION public.track_user_login(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    last_login_at = now(),
    last_active_at = now(),
    login_count = COALESCE(login_count, 0) + 1,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;
