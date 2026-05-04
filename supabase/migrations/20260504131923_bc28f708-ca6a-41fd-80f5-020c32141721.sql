-- Lock down SECURITY DEFINER functions in public schema.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated for frontend-callable RPCs (signatures verified).
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_user_login(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_notification_cooldown(p_campaign_id text, p_campaign_type text, p_hours integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_secrets_decrypted(user_id_param uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_pool_secrets_decrypted(user_id_param uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_wallet_secret(encrypted_secret text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_telegram_link_code(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_api_service_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_api_service_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_tg_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_registered_tg_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_token_search_analytics(p_start_date timestamptz, p_end_date timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_helius_usage_stats(p_start_date timestamptz, p_end_date timestamptz, p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_stats(p_start_date timestamptz, p_end_date timestamptz, p_service_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dust_wallet_stats(whale_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dust_wallets(min_sol_threshold numeric, max_token_value_usd numeric, recheck_interval_hours integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_buyer_intent_signals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rotation_patterns(min_communities integer, result_limit integer, result_offset integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accounts_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_old_morning_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_discount(user_id_param uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_subscription(user_id_param uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_telegram_announcement_recipients(p_audiences text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ban_user(target_user_id uuid, ban_until timestamptz) TO authenticated;

-- Pre-login flows.
GRANT EXECUTE ON FUNCTION public.verify_access_password(input_password text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_referral_signup(referral_code_param text, new_user_id uuid) TO anon, authenticated;

-- has_role is used inside RLS policies (run as caller's role).
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO anon, authenticated;