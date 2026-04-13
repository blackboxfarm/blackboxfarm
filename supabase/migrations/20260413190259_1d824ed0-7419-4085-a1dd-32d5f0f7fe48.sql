
-- 1. Promo codes table
CREATE TABLE public.promo_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 10,
  current_uses INTEGER NOT NULL DEFAULT 0,
  trial_duration_days INTEGER NOT NULL DEFAULT 30,
  tier_granted TEXT NOT NULL DEFAULT 'pro',
  source_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_unique UNIQUE (code)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage promo codes"
  ON public.promo_codes FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 2. Promo redemptions table
CREATE TABLE public.promo_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  telegram_user_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_label TEXT
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage redemptions"
  ON public.promo_redemptions FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view own redemptions"
  ON public.promo_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Tester feedback table
CREATE TABLE public.tester_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL DEFAULT 'general',
  page_path TEXT,
  message TEXT NOT NULL,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tester_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all feedback"
  ON public.tester_feedback FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can insert own feedback"
  ON public.tester_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
  ON public.tester_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Tester questionnaires table
CREATE TABLE public.tester_questionnaires (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_promo_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tester_questionnaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage questionnaires"
  ON public.tester_questionnaires FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active questionnaires"
  ON public.tester_questionnaires FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 5. Tester questionnaire responses table
CREATE TABLE public.tester_questionnaire_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id UUID NOT NULL REFERENCES public.tester_questionnaires(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tester_questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all responses"
  ON public.tester_questionnaire_responses FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can insert own responses"
  ON public.tester_questionnaire_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own responses"
  ON public.tester_questionnaire_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own responses"
  ON public.tester_questionnaire_responses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_promo_codes_code ON public.promo_codes (code);
CREATE INDEX idx_promo_redemptions_telegram_user_id ON public.promo_redemptions (telegram_user_id);
CREATE INDEX idx_promo_redemptions_user_id ON public.promo_redemptions (user_id);
CREATE INDEX idx_tester_feedback_user_id ON public.tester_feedback (user_id);
CREATE INDEX idx_tester_questionnaire_responses_questionnaire_id ON public.tester_questionnaire_responses (questionnaire_id);
