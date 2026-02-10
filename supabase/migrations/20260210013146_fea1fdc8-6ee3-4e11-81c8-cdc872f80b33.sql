-- Tighten permissive RLS policies - remove sol_price_cache reference

-- ADMIN TABLES - restrict to super_admin
DROP POLICY IF EXISTS "Allow service role to manage abused_tickers" ON public.abused_tickers;
CREATE POLICY "Super admins can manage abused_tickers" ON public.abused_tickers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can manage alerts" ON public.coingecko_error_alerts;
CREATE POLICY "Super admins can manage coingecko alerts" ON public.coingecko_error_alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Allow service role full access to dev reputation" ON public.dev_wallet_reputation;
CREATE POLICY "Super admins can manage dev reputation" ON public.dev_wallet_reputation FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role has full access to flipit_settings" ON public.flipit_settings;
CREATE POLICY "Super admins can manage flipit_settings" ON public.flipit_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role has full access to tweet quota" ON public.flipit_tweet_quota;
CREATE POLICY "Super admins can manage tweet quota" ON public.flipit_tweet_quota FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role has full access to tweet settings" ON public.flipit_tweet_settings;
CREATE POLICY "Super admins can manage tweet settings" ON public.flipit_tweet_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can manage all notification settings" ON public.flipit_notification_settings;
CREATE POLICY "Super admins can manage notification settings" ON public.flipit_notification_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can manage all notification targets" ON public.flipit_notification_targets;
CREATE POLICY "Super admins can manage notification targets" ON public.flipit_notification_targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role full access to rate limit state" ON public.helius_rate_limit_state;
CREATE POLICY "Super admins can manage rate limit state" ON public.helius_rate_limit_state FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role has full access to dex_triggers" ON public.holders_intel_dex_triggers;
CREATE POLICY "Super admins can manage dex_triggers" ON public.holders_intel_dex_triggers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can manage auto trades" ON public.mega_whale_auto_trades;
CREATE POLICY "Super admins can manage auto trades" ON public.mega_whale_auto_trades FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can manage pattern alerts" ON public.mega_whale_pattern_alerts;
CREATE POLICY "Super admins can manage pattern alerts" ON public.mega_whale_pattern_alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins can manage rules" ON public.trading_rules;
CREATE POLICY "Super admins can manage trading_rules" ON public.trading_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- LOGGING TABLES - authenticated insert only
DROP POLICY IF EXISTS "Edge functions can insert api_usage_log" ON public.api_usage_log;
CREATE POLICY "Authenticated can insert api_usage_log" ON public.api_usage_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can insert usage logs" ON public.helius_api_usage;
DROP POLICY IF EXISTS "Service role can insert helius usage" ON public.helius_api_usage;
CREATE POLICY "Authenticated can insert helius_api_usage" ON public.helius_api_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can log clicks" ON public.banner_clicks;
CREATE POLICY "Authenticated can log clicks" ON public.banner_clicks FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can log impressions" ON public.banner_impressions;
CREATE POLICY "Authenticated can log impressions" ON public.banner_impressions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- USER-SCOPED TABLES
DROP POLICY IF EXISTS "Anyone can update visits by session_id" ON public.holders_page_visits;
CREATE POLICY "Authenticated can update own visits" ON public.holders_page_visits FOR UPDATE TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Authenticated can manage fantasy positions" ON public.telegram_fantasy_positions;
DROP POLICY IF EXISTS "Service role full access to fantasy positions" ON public.telegram_fantasy_positions;
CREATE POLICY "Users can manage own fantasy positions" ON public.telegram_fantasy_positions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());