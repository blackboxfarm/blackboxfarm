-- ============================================================================
-- Per-profile-bot CRM: contacts + event timeline
-- ============================================================================

CREATE TABLE public.profile_bot_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL,
  telegram_user_id BIGINT NOT NULL,

  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_dms INT NOT NULL DEFAULT 0,

  -- attribution
  acquisition_source TEXT NOT NULL DEFAULT 'organic', -- 'organic'|'referral'|'unknown'
  first_referrer_code TEXT,
  first_referrer_tg_id BIGINT,
  last_referrer_code TEXT,
  utm_payload TEXT,

  -- subscription rollup
  ever_paid BOOLEAN NOT NULL DEFAULT false,
  is_currently_paid BOOLEAN NOT NULL DEFAULT false,
  total_subscriptions INT NOT NULL DEFAULT 0,
  total_months_paid INT NOT NULL DEFAULT 0,
  total_sol_paid NUMERIC NOT NULL DEFAULT 0,
  current_expires_at TIMESTAMPTZ,
  first_paid_at TIMESTAMPTZ,
  last_paid_at TIMESTAMPTZ,

  -- referrer rollup
  has_referral_code BOOLEAN NOT NULL DEFAULT false,
  referral_code TEXT,
  referral_code_status TEXT,
  referrals_attributed INT NOT NULL DEFAULT 0,
  referrals_converted INT NOT NULL DEFAULT 0,
  referrals_pending INT NOT NULL DEFAULT 0,
  referral_months_earned INT NOT NULL DEFAULT 0,

  -- comms
  opted_out_broadcasts BOOLEAN NOT NULL DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  last_broadcast_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (profile_key, telegram_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_bot_contacts TO authenticated;
GRANT ALL ON public.profile_bot_contacts TO service_role;

ALTER TABLE public.profile_bot_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_contacts"
ON public.profile_bot_contacts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_pbc_profile_paid ON public.profile_bot_contacts (profile_key, is_currently_paid);
CREATE INDEX idx_pbc_profile_source ON public.profile_bot_contacts (profile_key, acquisition_source);
CREATE INDEX idx_pbc_referral_code ON public.profile_bot_contacts (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_pbc_last_seen ON public.profile_bot_contacts (profile_key, last_seen_at DESC);

CREATE TRIGGER trg_pbc_updated_at
BEFORE UPDATE ON public.profile_bot_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.profile_bot_contact_events (
  id BIGSERIAL PRIMARY KEY,
  profile_key TEXT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.profile_bot_contact_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.profile_bot_contact_events_id_seq TO authenticated;
GRANT ALL ON public.profile_bot_contact_events TO service_role;
GRANT ALL ON SEQUENCE public.profile_bot_contact_events_id_seq TO service_role;

ALTER TABLE public.profile_bot_contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_contact_events"
ON public.profile_bot_contact_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_pbce_contact ON public.profile_bot_contact_events (profile_key, telegram_user_id, created_at DESC);
CREATE INDEX idx_pbce_type ON public.profile_bot_contact_events (profile_key, event_type, created_at DESC);
