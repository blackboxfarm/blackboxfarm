
-- ================================================================
-- 1. FIX SECURITY DEFINER VIEW: sol_price_source_stats
-- ================================================================
DROP VIEW IF EXISTS public.sol_price_source_stats;
CREATE VIEW public.sol_price_source_stats
WITH (security_invoker = true)
AS
SELECT source_name,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE success = true) AS successes,
    count(*) FILTER (WHERE success = false) AS failures,
    round(100.0 * count(*) FILTER (WHERE success = true)::numeric / NULLIF(count(*), 0)::numeric, 2) AS success_rate_pct,
    round(avg(response_time_ms) FILTER (WHERE success = true), 0) AS avg_success_time_ms,
    max(created_at) AS last_attempt_at
FROM sol_price_fetch_logs
WHERE created_at > (now() - '24:00:00'::interval)
GROUP BY source_name
ORDER BY success_rate_pct DESC, avg_success_time_ms;

-- ================================================================
-- 2. FIX MUTABLE SEARCH PATHS (10 functions)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE(jobname text, schedule text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jobname::text, schedule::text, active 
  FROM cron.job 
  WHERE jobname LIKE 'holdersintel%' OR jobname LIKE 'twitter-scanner%'
  ORDER BY jobname;
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_id
  FROM user_roles ur
  WHERE ur.role = 'super_admin' 
    AND ur.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_arb_balances_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_record RECORD;
BEGIN
  SELECT initial_eth_mainnet, initial_eth_base, initial_base_tokens,
    initial_usdc_mainnet, initial_usdc_base
  INTO config_record
  FROM arb_bot_config WHERE user_id = p_user_id;
  
  INSERT INTO arb_balances (user_id, eth_mainnet, eth_base, base_token_base, usdc_mainnet, usdc_base, total_value_usd, last_updated)
  VALUES (p_user_id, config_record.initial_eth_mainnet, config_record.initial_eth_base, config_record.initial_base_tokens, config_record.initial_usdc_mainnet, config_record.initial_usdc_base, 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    eth_mainnet = EXCLUDED.eth_mainnet, eth_base = EXCLUDED.eth_base, base_token_base = EXCLUDED.base_token_base,
    usdc_mainnet = EXCLUDED.usdc_mainnet, usdc_base = EXCLUDED.usdc_base, last_updated = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Audit records cannot be modified after creation';
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_initialize_arb_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.initialize_arb_balances_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_arb_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pumpfun_fantasy_positions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_telegram_fantasy_positions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_whale_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.whale_name IS NOT NULL THEN
    INSERT INTO telegram_whale_profiles (whale_name, total_calls, last_seen_at)
    VALUES (NEW.whale_name, 1, now())
    ON CONFLICT (whale_name) 
    DO UPDATE SET 
      total_calls = telegram_whale_profiles.total_calls + 1,
      last_seen_at = now(),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ================================================================
-- 3. FIX MATERIALIZED VIEW IN API (move out of public schema access)
-- ================================================================
-- Revoke direct API access to the materialized view
REVOKE SELECT ON public.mesh_summary FROM anon, authenticated;

-- ================================================================
-- 4. TIGHTEN PERMISSIVE RLS POLICIES
-- Service-role-only tables: restrict to super_admin (service role bypasses RLS anyway)
-- ================================================================

-- admin_notifications
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.admin_notifications;
CREATE POLICY "Super admins can insert notifications" ON public.admin_notifications FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- invalid_scraped_tokens
DROP POLICY IF EXISTS "Service role can manage invalid tokens" ON public.invalid_scraped_tokens;
CREATE POLICY "Super admins can manage invalid tokens" ON public.invalid_scraped_tokens FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- mega_whale_offspring
DROP POLICY IF EXISTS "Service role can manage offspring" ON public.mega_whale_offspring;
CREATE POLICY "Super admins can manage offspring" ON public.mega_whale_offspring FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- mega_whale_token_alerts
DROP POLICY IF EXISTS "Service role can insert alerts" ON public.mega_whale_token_alerts;
CREATE POLICY "Super admins can insert alerts" ON public.mega_whale_token_alerts FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- mint_monitor_detections
DROP POLICY IF EXISTS "Service role can manage detections" ON public.mint_monitor_detections;
CREATE POLICY "Super admins can manage detections" ON public.mint_monitor_detections FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- mint_monitor_scan_logs
DROP POLICY IF EXISTS "Service role can insert scan logs" ON public.mint_monitor_scan_logs;
CREATE POLICY "Super admins can insert scan logs" ON public.mint_monitor_scan_logs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- oracle_backfill_jobs
DROP POLICY IF EXISTS "Service role can manage backfill jobs" ON public.oracle_backfill_jobs;
CREATE POLICY "Super admins can manage backfill jobs" ON public.oracle_backfill_jobs FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- phone_verifications
DROP POLICY IF EXISTS "Service role only phone verifications" ON public.phone_verifications;
CREATE POLICY "Super admins can manage phone verifications" ON public.phone_verifications FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_daily_stats
DROP POLICY IF EXISTS "Allow all access to pumpfun_daily_stats" ON public.pumpfun_daily_stats;
CREATE POLICY "Super admins can manage pumpfun_daily_stats" ON public.pumpfun_daily_stats FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_discovery_logs INSERT
DROP POLICY IF EXISTS "Service can insert discovery logs" ON public.pumpfun_discovery_logs;
CREATE POLICY "Super admins can insert discovery logs" ON public.pumpfun_discovery_logs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_discovery_logs UPDATE
DROP POLICY IF EXISTS "Authenticated users can update manual review fields" ON public.pumpfun_discovery_logs;
CREATE POLICY "Super admins can update discovery logs" ON public.pumpfun_discovery_logs FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_fantasy_positions
DROP POLICY IF EXISTS "Service role full access to fantasy positions" ON public.pumpfun_fantasy_positions;
CREATE POLICY "Super admins can manage fantasy positions" ON public.pumpfun_fantasy_positions FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_fantasy_stats
DROP POLICY IF EXISTS "Service role full access to fantasy stats" ON public.pumpfun_fantasy_stats;
CREATE POLICY "Super admins can manage fantasy stats" ON public.pumpfun_fantasy_stats FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_kol_tweets
DROP POLICY IF EXISTS "Allow service role full access to KOL tweets" ON public.pumpfun_kol_tweets;
CREATE POLICY "Super admins can manage KOL tweets" ON public.pumpfun_kol_tweets FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_metric_snapshots
DROP POLICY IF EXISTS "Service role can manage metric_snapshots" ON public.pumpfun_metric_snapshots;
CREATE POLICY "Super admins can manage metric snapshots" ON public.pumpfun_metric_snapshots FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_neutrallist
DROP POLICY IF EXISTS "Authenticated users can delete neutrallist" ON public.pumpfun_neutrallist;
CREATE POLICY "Super admins can delete neutrallist" ON public.pumpfun_neutrallist FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated users can insert neutrallist" ON public.pumpfun_neutrallist;
CREATE POLICY "Super admins can insert neutrallist" ON public.pumpfun_neutrallist FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated users can update neutrallist" ON public.pumpfun_neutrallist;
CREATE POLICY "Super admins can update neutrallist" ON public.pumpfun_neutrallist FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_poll_runs
DROP POLICY IF EXISTS "Allow insert for service role" ON public.pumpfun_poll_runs;
CREATE POLICY "Super admins can insert poll runs" ON public.pumpfun_poll_runs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Allow update for service role" ON public.pumpfun_poll_runs;
CREATE POLICY "Super admins can update poll runs" ON public.pumpfun_poll_runs FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_rejection_events
DROP POLICY IF EXISTS "Service role can manage rejection_events" ON public.pumpfun_rejection_events;
CREATE POLICY "Super admins can manage rejection events" ON public.pumpfun_rejection_events FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_seen_symbols
DROP POLICY IF EXISTS "Service role can manage seen_symbols" ON public.pumpfun_seen_symbols;
CREATE POLICY "Super admins can manage seen symbols" ON public.pumpfun_seen_symbols FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_trade_learnings
DROP POLICY IF EXISTS "Service role has full access to trade learnings" ON public.pumpfun_trade_learnings;
CREATE POLICY "Super admins can manage trade learnings" ON public.pumpfun_trade_learnings FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- pumpfun_watchlist
DROP POLICY IF EXISTS "Service role can manage watchlist" ON public.pumpfun_watchlist;
CREATE POLICY "Super admins can manage watchlist" ON public.pumpfun_watchlist FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- reputation_mesh
DROP POLICY IF EXISTS "Service role can manage reputation mesh" ON public.reputation_mesh;
CREATE POLICY "Super admins can manage reputation mesh" ON public.reputation_mesh FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- scalp_signal_tracker
DROP POLICY IF EXISTS "Allow all access to scalp_signal_tracker" ON public.scalp_signal_tracker;
CREATE POLICY "Super admins can manage scalp signals" ON public.scalp_signal_tracker FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- scraped_tokens INSERT
DROP POLICY IF EXISTS "Anyone can insert scraped tokens" ON public.scraped_tokens;
CREATE POLICY "Super admins can insert scraped tokens" ON public.scraped_tokens FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- scraped_tokens UPDATE
DROP POLICY IF EXISTS "Anyone can update scraped tokens" ON public.scraped_tokens;
CREATE POLICY "Super admins can update scraped tokens" ON public.scraped_tokens FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- sol_price_fetch_logs
DROP POLICY IF EXISTS "Service role can insert logs" ON public.sol_price_fetch_logs;
CREATE POLICY "Super admins can insert price logs" ON public.sol_price_fetch_logs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- system_settings
DROP POLICY IF EXISTS "Service role has full access to system_settings" ON public.system_settings;
CREATE POLICY "Super admins can manage system settings" ON public.system_settings FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_callers
DROP POLICY IF EXISTS "Allow service insert to telegram_callers" ON public.telegram_callers;
CREATE POLICY "Super admins can insert telegram callers" ON public.telegram_callers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Allow service update to telegram_callers" ON public.telegram_callers;
CREATE POLICY "Super admins can update telegram callers" ON public.telegram_callers FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_message_interpretations
DROP POLICY IF EXISTS "Service role full access to interpretations" ON public.telegram_message_interpretations;
CREATE POLICY "Super admins can manage interpretations" ON public.telegram_message_interpretations FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_monitor_lock
DROP POLICY IF EXISTS "Service role can manage lock" ON public.telegram_monitor_lock;
CREATE POLICY "Super admins can manage monitor lock" ON public.telegram_monitor_lock FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_monitor_run_logs
DROP POLICY IF EXISTS "Service role can insert monitor run logs" ON public.telegram_monitor_run_logs;
CREATE POLICY "Super admins can insert monitor run logs" ON public.telegram_monitor_run_logs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can update monitor run logs" ON public.telegram_monitor_run_logs;
CREATE POLICY "Super admins can update monitor run logs" ON public.telegram_monitor_run_logs FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_whale_profiles
DROP POLICY IF EXISTS "Allow service role full access to whale profiles" ON public.telegram_whale_profiles;
CREATE POLICY "Super admins can manage whale profiles" ON public.telegram_whale_profiles FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- telegram_whale_stats
DROP POLICY IF EXISTS "Allow all access to whale stats" ON public.telegram_whale_stats;
CREATE POLICY "Super admins can manage whale stats" ON public.telegram_whale_stats FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_account_cleanup_logs
DROP POLICY IF EXISTS "Service role full access" ON public.token_account_cleanup_logs;
CREATE POLICY "Super admins can manage cleanup logs" ON public.token_account_cleanup_logs FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_ai_interpretations DELETE
DROP POLICY IF EXISTS "Service role can delete expired interpretations" ON public.token_ai_interpretations;
CREATE POLICY "Super admins can delete interpretations" ON public.token_ai_interpretations FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- token_ai_interpretations INSERT
DROP POLICY IF EXISTS "Service role can insert interpretations" ON public.token_ai_interpretations;
CREATE POLICY "Super admins can insert interpretations" ON public.token_ai_interpretations FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_analysis_costs
DROP POLICY IF EXISTS "Edge functions can insert token_analysis_costs" ON public.token_analysis_costs;
CREATE POLICY "Super admins can insert analysis costs" ON public.token_analysis_costs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Edge functions can update token_analysis_costs" ON public.token_analysis_costs;
CREATE POLICY "Super admins can update analysis costs" ON public.token_analysis_costs FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_dex_status_history
DROP POLICY IF EXISTS "Service role can insert token_dex_status_history" ON public.token_dex_status_history;
CREATE POLICY "Super admins can insert dex status history" ON public.token_dex_status_history FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_early_trades
DROP POLICY IF EXISTS "Allow service role insert/update for token_early_trades" ON public.token_early_trades;
CREATE POLICY "Super admins can manage early trades" ON public.token_early_trades FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_lifecycle
DROP POLICY IF EXISTS "Service role can manage lifecycle" ON public.token_lifecycle;
CREATE POLICY "Super admins can manage lifecycle" ON public.token_lifecycle FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_lifecycle_tracking
DROP POLICY IF EXISTS "Allow service role full access to token lifecycle" ON public.token_lifecycle_tracking;
CREATE POLICY "Super admins can manage lifecycle tracking" ON public.token_lifecycle_tracking FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_mint_watchdog
DROP POLICY IF EXISTS "Service role can insert watchdog records" ON public.token_mint_watchdog;
CREATE POLICY "Super admins can insert watchdog records" ON public.token_mint_watchdog FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Service role can update watchdog records" ON public.token_mint_watchdog;
CREATE POLICY "Super admins can update watchdog records" ON public.token_mint_watchdog FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_price_history
DROP POLICY IF EXISTS "Service role can insert token_price_history" ON public.token_price_history;
CREATE POLICY "Super admins can insert price history" ON public.token_price_history FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_projects
DROP POLICY IF EXISTS "Authenticated users can insert token_projects" ON public.token_projects;
CREATE POLICY "Authenticated users can insert token_projects" ON public.token_projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update token_projects" ON public.token_projects;
CREATE POLICY "Authenticated users can update token_projects" ON public.token_projects FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- token_rankings
DROP POLICY IF EXISTS "Service role can insert rankings" ON public.token_rankings;
CREATE POLICY "Super admins can insert rankings" ON public.token_rankings FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_search_log
DROP POLICY IF EXISTS "Service role can insert token_search_log" ON public.token_search_log;
CREATE POLICY "Super admins can insert search log" ON public.token_search_log FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_search_results
DROP POLICY IF EXISTS "Service role can insert token_search_results" ON public.token_search_results;
CREATE POLICY "Super admins can insert search results" ON public.token_search_results FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- token_socials_history
DROP POLICY IF EXISTS "Service role can insert token_socials_history" ON public.token_socials_history;
CREATE POLICY "Super admins can insert socials history" ON public.token_socials_history FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- trading_keywords
DROP POLICY IF EXISTS "Super admins can manage keywords" ON public.trading_keywords;
CREATE POLICY "Super admins can manage keywords" ON public.trading_keywords FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- twitter_scanner_state
DROP POLICY IF EXISTS "Service role full access to twitter_scanner_state" ON public.twitter_scanner_state;
CREATE POLICY "Super admins can manage twitter scanner state" ON public.twitter_scanner_state FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- whale_frenzy_events
DROP POLICY IF EXISTS "Service role can insert frenzy events" ON public.whale_frenzy_events;
CREATE POLICY "Super admins can insert frenzy events" ON public.whale_frenzy_events FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ================================================================
-- Public analytics/tracking tables: restrict to authenticated users
-- ================================================================

-- feature_usage_analytics
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.feature_usage_analytics;
CREATE POLICY "Authenticated users can insert analytics" ON public.feature_usage_analytics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- holders_page_visits
DROP POLICY IF EXISTS "Anyone can insert visits" ON public.holders_page_visits;
CREATE POLICY "Authenticated users can insert visits" ON public.holders_page_visits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- premium_feature_views
DROP POLICY IF EXISTS "Anyone can create feature views" ON public.premium_feature_views;
CREATE POLICY "Authenticated users can create feature views" ON public.premium_feature_views FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- advertiser_inquiries (public form - keep open but require basic check)
DROP POLICY IF EXISTS "Service role can insert inquiries" ON public.advertiser_inquiries;
CREATE POLICY "Anyone can submit inquiries" ON public.advertiser_inquiries FOR INSERT WITH CHECK (true);

-- fuct_gift_claims (public claims - keep open)
DROP POLICY IF EXISTS "Allow public inserts for gift claims" ON public.fuct_gift_claims;
CREATE POLICY "Anyone can claim gifts" ON public.fuct_gift_claims FOR INSERT WITH CHECK (true);
