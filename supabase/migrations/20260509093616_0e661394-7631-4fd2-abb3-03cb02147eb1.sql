
-- Helper macro: admin/super_admin check
-- Uses existing public.has_role(uuid, app_role) and public.is_super_admin(uuid)

-- telegram_group_messages
DROP POLICY IF EXISTS "Authenticated users can view group messages" ON public.telegram_group_messages;
CREATE POLICY "Admins can view group messages" ON public.telegram_group_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- installer_x_profiles
DROP POLICY IF EXISTS "Authenticated users can read installer_x_profiles" ON public.installer_x_profiles;
CREATE POLICY "Admins can read installer_x_profiles" ON public.installer_x_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- intel_briefing_variants
DROP POLICY IF EXISTS "Authenticated users can insert variants" ON public.intel_briefing_variants;
DROP POLICY IF EXISTS "Authenticated users can update variants" ON public.intel_briefing_variants;
DROP POLICY IF EXISTS "Authenticated users can delete variants" ON public.intel_briefing_variants;
CREATE POLICY "Admins can insert variants" ON public.intel_briefing_variants
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins can update variants" ON public.intel_briefing_variants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins can delete variants" ON public.intel_briefing_variants
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- gallery_style_categories
DROP POLICY IF EXISTS "Authenticated users can manage style categories" ON public.gallery_style_categories;
CREATE POLICY "Admins can manage style categories" ON public.gallery_style_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- social_media_gallery
DROP POLICY IF EXISTS "Authenticated users can manage gallery" ON public.social_media_gallery;
CREATE POLICY "Admins can manage gallery" ON public.social_media_gallery
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- image_style_presets
DROP POLICY IF EXISTS "Authenticated users manage style presets" ON public.image_style_presets;
CREATE POLICY "Admins can manage style presets" ON public.image_style_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- twitter_tg_targets
DROP POLICY IF EXISTS "Admin full access on twitter_tg_targets" ON public.twitter_tg_targets;
CREATE POLICY "Admins manage twitter_tg_targets" ON public.twitter_tg_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- hunter_tweet_findings
DROP POLICY IF EXISTS "Admin full access on hunter_tweet_findings" ON public.hunter_tweet_findings;
CREATE POLICY "Admins manage hunter_tweet_findings" ON public.hunter_tweet_findings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- content_drafts
DROP POLICY IF EXISTS "Authenticated users can manage content drafts" ON public.content_drafts;
CREATE POLICY "Admins manage content drafts" ON public.content_drafts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- repurpose_source_accounts
DROP POLICY IF EXISTS "Authenticated users can manage source accounts" ON public.repurpose_source_accounts;
CREATE POLICY "Admins manage source accounts" ON public.repurpose_source_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- repurpose_scraped_posts
DROP POLICY IF EXISTS "Authenticated users can manage scraped posts" ON public.repurpose_scraped_posts;
CREATE POLICY "Admins manage scraped posts" ON public.repurpose_scraped_posts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- scraper_provider_config
DROP POLICY IF EXISTS "Authenticated users can update scraper_provider_config" ON public.scraper_provider_config;
CREATE POLICY "Admins update scraper_provider_config" ON public.scraper_provider_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- meta_tags_config
DROP POLICY IF EXISTS "Authenticated users can insert meta tags" ON public.meta_tags_config;
DROP POLICY IF EXISTS "Authenticated users can update meta tags" ON public.meta_tags_config;
DROP POLICY IF EXISTS "Authenticated users can delete meta tags" ON public.meta_tags_config;
CREATE POLICY "Admins insert meta tags" ON public.meta_tags_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins update meta tags" ON public.meta_tags_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins delete meta tags" ON public.meta_tags_config
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

-- boost_entries
DROP POLICY IF EXISTS "Authenticated users can insert boosts" ON public.boost_entries;
DROP POLICY IF EXISTS "Authenticated users can update boosts" ON public.boost_entries;
DROP POLICY IF EXISTS "Authenticated users can delete boosts" ON public.boost_entries;
CREATE POLICY "Admins insert boosts" ON public.boost_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins update boosts" ON public.boost_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins delete boosts" ON public.boost_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));
