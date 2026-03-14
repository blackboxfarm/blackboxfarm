
-- ============================================================
-- WARNING FIX 1: fantasy_tweet_templates - restrict writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to fantasy_tweet_templates" ON public.fantasy_tweet_templates;

CREATE POLICY "Anyone can read tweet templates" ON public.fantasy_tweet_templates
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage tweet templates" ON public.fantasy_tweet_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 2: promo_tweet_templates - restrict writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to promo_tweet_templates" ON public.promo_tweet_templates;

CREATE POLICY "Anyone can read promo tweet templates" ON public.promo_tweet_templates
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage promo tweet templates" ON public.promo_tweet_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 3: promo_tweet_config - restrict writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to promo_tweet_config" ON public.promo_tweet_config;

CREATE POLICY "Anyone can read promo tweet config" ON public.promo_tweet_config
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage promo tweet config" ON public.promo_tweet_config
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 4: proven_dev_tokens - fix misconfigured service_role policy
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on proven_dev_tokens" ON public.proven_dev_tokens;

CREATE POLICY "Anyone can read proven dev tokens" ON public.proven_dev_tokens
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage proven dev tokens" ON public.proven_dev_tokens
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 5: kol_registry - fix misconfigured service_role policy
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on kol_registry" ON public.kol_registry;

CREATE POLICY "Anyone can read kol registry" ON public.kol_registry
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage kol registry" ON public.kol_registry
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 6: pumpfun_comment_accounts - restrict writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to comment accounts" ON public.pumpfun_comment_accounts;

CREATE POLICY "Anyone can read comment accounts" ON public.pumpfun_comment_accounts
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage comment accounts" ON public.pumpfun_comment_accounts
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 7: pumpfun_token_comments - restrict writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to token comments" ON public.pumpfun_token_comments;

CREATE POLICY "Anyone can read token comments" ON public.pumpfun_token_comments
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage token comments" ON public.pumpfun_token_comments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 8: flipit_global_config - restrict updates to super_admin
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated update" ON public.flipit_global_config;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.flipit_global_config;

CREATE POLICY "Authenticated users can read global config" ON public.flipit_global_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins can update global config" ON public.flipit_global_config
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- WARNING FIX 9: development_ideas - restrict to authenticated users
-- ============================================================
DROP POLICY IF EXISTS "Users can manage development ideas" ON public.development_ideas;

CREATE POLICY "Authenticated users can read development ideas" ON public.development_ideas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL OR public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert development ideas" ON public.development_ideas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own development ideas" ON public.development_ideas
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can delete own development ideas" ON public.development_ideas
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));
