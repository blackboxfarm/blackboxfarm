-- Phase 1: Database Infrastructure - Fixed RLS Policies

-- ============================================================================
-- HOLDER ANALYSIS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.holder_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  wallet_address text NOT NULL,
  action text NOT NULL CHECK (action IN ('buy', 'sell', 'accumulate', 'distribute')),
  amount_tokens numeric NOT NULL,
  usd_value numeric,
  percentage_of_supply numeric,
  tier text,
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holder_movements_token ON public.holder_movements(token_mint, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_holder_movements_wallet ON public.holder_movements(wallet_address);
CREATE INDEX IF NOT EXISTS idx_holder_movements_detected ON public.holder_movements(detected_at DESC);

CREATE TABLE IF NOT EXISTS public.holder_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  snapshot_date date NOT NULL,
  wallet_address text NOT NULL,
  balance numeric NOT NULL,
  usd_value numeric,
  tier text,
  price_at_snapshot numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_mint, snapshot_date, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_token_date ON public.holder_snapshots(token_mint, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_wallet ON public.holder_snapshots(wallet_address);

CREATE TABLE IF NOT EXISTS public.wallet_profiles (
  wallet_address text PRIMARY KEY,
  smart_money_score integer DEFAULT 50 CHECK (smart_money_score >= 0 AND smart_money_score <= 100),
  total_tokens_traded integer DEFAULT 0,
  win_rate numeric,
  total_realized_pnl numeric DEFAULT 0,
  total_volume_usd numeric DEFAULT 0,
  early_entry_count integer DEFAULT 0,
  diamond_hands_count integer DEFAULT 0,
  paper_hands_count integer DEFAULT 0,
  last_analyzed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_profiles_score ON public.wallet_profiles(smart_money_score DESC);

CREATE TABLE IF NOT EXISTS public.wallet_token_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  token_mint text NOT NULL,
  entry_date timestamptz,
  entry_price numeric,
  exit_date timestamptz,
  exit_price numeric,
  max_balance numeric,
  current_balance numeric DEFAULT 0,
  realized_pnl numeric DEFAULT 0,
  unrealized_pnl numeric DEFAULT 0,
  behavior_pattern text CHECK (behavior_pattern IN ('accumulator', 'flipper', 'holder', 'distributor', 'unknown')),
  transaction_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_token_history_wallet ON public.wallet_token_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_token_history_token ON public.wallet_token_history(token_mint);

CREATE TABLE IF NOT EXISTS public.wallet_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  token_mint text,
  alert_on_movement boolean DEFAULT true,
  minimum_movement_usd numeric DEFAULT 1000,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, wallet_address, token_mint)
);

CREATE INDEX IF NOT EXISTS idx_wallet_follows_user ON public.wallet_follows(user_id);

-- ============================================================================
-- ANALYTICS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_usage_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  token_mint text,
  session_id text,
  duration_seconds integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON public.feature_usage_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_feature ON public.feature_usage_analytics(feature_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_feature_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_as_teaser boolean DEFAULT false,
  converted_to_signup boolean DEFAULT false,
  token_mint text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_views_feature ON public.premium_feature_views(feature_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_alerts_enabled boolean DEFAULT true,
  alert_types jsonb DEFAULT '["holder_movements", "retention_milestones", "smart_money_alerts", "survey_invitations"]'::jsonb,
  survey_frequency_days integer DEFAULT 7,
  last_survey_shown_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON public.user_preferences(user_id);

-- ============================================================================
-- SURVEY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  questions jsonb NOT NULL,
  prize_description text,
  prize_value numeric,
  prize_quantity integer DEFAULT 1,
  target_audience text DEFAULT 'all_users' CHECK (target_audience IN ('all_users', 'premium_users', 'new_users')),
  is_active boolean DEFAULT false,
  start_date timestamptz,
  end_date timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_active ON public.surveys(is_active, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responses jsonb NOT NULL,
  completion_time_seconds integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(survey_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON public.survey_responses(survey_id);

CREATE TABLE IF NOT EXISTS public.survey_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  prize_claimed boolean DEFAULT false,
  notified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(survey_id, user_id)
);

-- ============================================================================
-- BANNER TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.banner_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text NOT NULL,
  link_url text NOT NULL,
  position integer NOT NULL CHECK (position >= 1 AND position <= 4),
  weight integer DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
  is_active boolean DEFAULT true,
  start_date timestamptz,
  end_date timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_ads_position ON public.banner_ads(position, is_active, weight DESC);

CREATE TABLE IF NOT EXISTS public.banner_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES public.banner_ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_impressions_banner ON public.banner_impressions(banner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.banner_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES public.banner_ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_clicks_banner ON public.banner_clicks(banner_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.holder_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view holder movements" ON public.holder_movements;
DROP POLICY IF EXISTS "Service role can manage holder movements" ON public.holder_movements;
CREATE POLICY "Anyone can view holder movements" ON public.holder_movements FOR SELECT USING (true);
CREATE POLICY "Service role can insert holder movements" ON public.holder_movements FOR INSERT WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

ALTER TABLE public.holder_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view holder snapshots" ON public.holder_snapshots;
DROP POLICY IF EXISTS "Service role can manage snapshots" ON public.holder_snapshots;
CREATE POLICY "Anyone can view holder snapshots" ON public.holder_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role can insert snapshots" ON public.holder_snapshots FOR INSERT WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

ALTER TABLE public.wallet_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view wallet profiles" ON public.wallet_profiles;
DROP POLICY IF EXISTS "Service role can manage wallet profiles" ON public.wallet_profiles;
CREATE POLICY "Anyone can view wallet profiles" ON public.wallet_profiles FOR SELECT USING (true);
CREATE POLICY "Service role can manage wallet profiles" ON public.wallet_profiles FOR ALL USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

ALTER TABLE public.wallet_token_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view wallet token history" ON public.wallet_token_history;
DROP POLICY IF EXISTS "Service role can manage wallet token history" ON public.wallet_token_history;
CREATE POLICY "Anyone can view wallet token history" ON public.wallet_token_history FOR SELECT USING (true);
CREATE POLICY "Service role can manage wallet token history" ON public.wallet_token_history FOR ALL USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

ALTER TABLE public.wallet_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own wallet follows" ON public.wallet_follows;
CREATE POLICY "Users can manage their own wallet follows" ON public.wallet_follows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.feature_usage_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own analytics" ON public.feature_usage_analytics;
DROP POLICY IF EXISTS "Service role can manage analytics" ON public.feature_usage_analytics;
CREATE POLICY "Users can view their own analytics" ON public.feature_usage_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can insert analytics" ON public.feature_usage_analytics FOR INSERT WITH CHECK (true);

ALTER TABLE public.premium_feature_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own feature views" ON public.premium_feature_views;
DROP POLICY IF EXISTS "Anyone can create feature views" ON public.premium_feature_views;
CREATE POLICY "Users can view their own feature views" ON public.premium_feature_views FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Anyone can create feature views" ON public.premium_feature_views FOR INSERT WITH CHECK (true);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.user_preferences;
CREATE POLICY "Users can manage their own preferences" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active surveys" ON public.surveys;
DROP POLICY IF EXISTS "Super admins can manage surveys" ON public.surveys;
CREATE POLICY "Anyone can view active surveys" ON public.surveys FOR SELECT USING (is_active = true OR is_super_admin(auth.uid()));
CREATE POLICY "Super admins can manage surveys" ON public.surveys FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own responses" ON public.survey_responses;
CREATE POLICY "Users can manage their own responses" ON public.survey_responses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.survey_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own wins" ON public.survey_winners;
DROP POLICY IF EXISTS "Super admins can manage winners" ON public.survey_winners;
CREATE POLICY "Users can view their own wins" ON public.survey_winners FOR SELECT USING (auth.uid() = user_id OR is_super_admin(auth.uid()));
CREATE POLICY "Super admins can manage winners" ON public.survey_winners FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

ALTER TABLE public.banner_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banner_ads;
DROP POLICY IF EXISTS "Super admins can manage banners" ON public.banner_ads;
CREATE POLICY "Anyone can view active banners" ON public.banner_ads FOR SELECT USING (is_active = true OR is_super_admin(auth.uid()));
CREATE POLICY "Super admins can manage banners" ON public.banner_ads FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

ALTER TABLE public.banner_impressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can log impressions" ON public.banner_impressions;
DROP POLICY IF EXISTS "Super admins can view impressions" ON public.banner_impressions;
CREATE POLICY "Service role can log impressions" ON public.banner_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "Super admins can view impressions" ON public.banner_impressions FOR SELECT USING (is_super_admin(auth.uid()));

ALTER TABLE public.banner_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can log clicks" ON public.banner_clicks;
DROP POLICY IF EXISTS "Super admins can view clicks" ON public.banner_clicks;
CREATE POLICY "Service role can log clicks" ON public.banner_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Super admins can view clicks" ON public.banner_clicks FOR SELECT USING (is_super_admin(auth.uid()));