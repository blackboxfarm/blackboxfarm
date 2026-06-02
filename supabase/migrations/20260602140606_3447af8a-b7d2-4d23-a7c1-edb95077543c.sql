
-- Affiliate / referral system for profile subscription bots

CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activated_at TIMESTAMPTZ DEFAULT now(),
  last_deactivated_at TIMESTAMPTZ,
  UNIQUE (profile_key, telegram_user_id),
  UNIQUE (profile_key, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full" ON public.referral_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.referral_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL,
  referrer_code TEXT NOT NULL,
  referrer_telegram_user_id BIGINT NOT NULL,
  referred_telegram_user_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  subscription_id UUID REFERENCES public.profile_subscriptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  UNIQUE (profile_key, referred_telegram_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_attributions TO authenticated;
GRANT ALL ON public.referral_attributions TO service_role;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full" ON public.referral_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.referral_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL,
  referrer_telegram_user_id BIGINT NOT NULL,
  attribution_id UUID REFERENCES public.referral_attributions(id) ON DELETE SET NULL,
  months_granted INT NOT NULL DEFAULT 1,
  applied_to_subscription_id UUID REFERENCES public.profile_subscriptions(id) ON DELETE SET NULL,
  new_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_credits TO authenticated;
GRANT ALL ON public.referral_credits TO service_role;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full" ON public.referral_credits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_ref_attr_referred ON public.referral_attributions(profile_key, referred_telegram_user_id);
CREATE INDEX idx_ref_attr_pending ON public.referral_attributions(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_ref_codes_lookup ON public.referral_codes(profile_key, code);

-- Config columns
ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS affiliate_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS affiliate_months_per_referral INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS affiliate_pending_window_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS affiliate_marketing_copy TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_footer_copy TEXT DEFAULT '🎁 Refer friends — every paid signup adds +1 free month to your subscription.\n🔗 {ref_link}';
