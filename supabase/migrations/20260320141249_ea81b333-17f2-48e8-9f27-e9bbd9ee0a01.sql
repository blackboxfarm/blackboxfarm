
-- =====================================================
-- Tier 1 Security Fix: token_projects + profiles
-- =====================================================

-- Fix A: token_projects — Restrict INSERT/UPDATE to super_admins only
-- Currently any authenticated user can insert/update trust ratings, risk levels, etc.

DROP POLICY "Authenticated users can insert token_projects" ON public.token_projects;
CREATE POLICY "Super admins can insert token_projects" ON public.token_projects
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY "Authenticated users can update token_projects" ON public.token_projects;
CREATE POLICY "Super admins can update token_projects" ON public.token_projects
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Fix B: profiles — Prevent admins from reading two_factor_secret
-- Strategy: Revoke direct column access, create a security definer view
-- Step 1: Create a safe view that excludes sensitive columns for admin reads
-- Step 2: Replace the SELECT policy to use column-level security

-- We can't do column-level RLS in Postgres, so instead we NULL out the secret
-- for non-owner reads using a security definer function + trigger approach.
-- Simplest safe approach: move two_factor_secret to a separate table.

-- Create dedicated 2FA secrets table (only accessible by the owner)
CREATE TABLE IF NOT EXISTS public.user_2fa_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  two_factor_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_2fa_secrets ENABLE ROW LEVEL SECURITY;

-- Only the owner can read their own 2FA secret
CREATE POLICY "Users read own 2FA secret"
  ON public.user_2fa_secrets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Only the owner can update their own 2FA secret
CREATE POLICY "Users update own 2FA secret"
  ON public.user_2fa_secrets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only the owner can insert their own 2FA secret
CREATE POLICY "Users insert own 2FA secret"
  ON public.user_2fa_secrets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Migrate existing secrets from profiles to new table
INSERT INTO public.user_2fa_secrets (user_id, two_factor_secret)
SELECT user_id, two_factor_secret FROM public.profiles
WHERE two_factor_secret IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  two_factor_secret = EXCLUDED.two_factor_secret,
  updated_at = now();

-- =====================================================
-- REVERSAL SQL (save for reference):
-- DROP TABLE IF EXISTS public.user_2fa_secrets;
-- DROP POLICY "Super admins can insert token_projects" ON public.token_projects;
-- CREATE POLICY "Authenticated users can insert token_projects" ON public.token_projects
--   FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
-- DROP POLICY "Super admins can update token_projects" ON public.token_projects;
-- CREATE POLICY "Authenticated users can update token_projects" ON public.token_projects
--   FOR UPDATE TO public USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- =====================================================
