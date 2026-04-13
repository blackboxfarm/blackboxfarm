
-- Security SMS alerts: outbound alerts + user responses
CREATE TABLE IF NOT EXISTS public.security_sms_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message_body TEXT NOT NULL,
  expected_responses TEXT[] NOT NULL DEFAULT ARRAY['Y','N'],
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  user_response TEXT,
  response_action TEXT,
  action_executed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_security_sms_user ON public.security_sms_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_security_sms_phone ON public.security_sms_alerts(phone_number);
CREATE INDEX IF NOT EXISTS idx_security_sms_status ON public.security_sms_alerts(status);
CREATE INDEX IF NOT EXISTS idx_security_sms_expires ON public.security_sms_alerts(expires_at);

ALTER TABLE public.security_sms_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own security alerts"
  ON public.security_sms_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages security alerts"
  ON public.security_sms_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Login history for anomaly detection
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  device_fingerprint TEXT,
  user_agent TEXT,
  login_method TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicion_reasons TEXT[],
  alert_id UUID REFERENCES public.security_sms_alerts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON public.login_history(created_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages login history"
  ON public.login_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Account lockdown state
CREATE TABLE IF NOT EXISTS public.account_lockdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT true,
  locked_reason TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_at TIMESTAMPTZ,
  unlock_method TEXT,
  alert_id UUID REFERENCES public.security_sms_alerts(id),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_account_lockdowns_user ON public.account_lockdowns(user_id);
CREATE INDEX IF NOT EXISTS idx_account_lockdowns_active ON public.account_lockdowns(user_id, is_locked) WHERE is_locked = true;

ALTER TABLE public.account_lockdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lockdowns"
  ON public.account_lockdowns FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages lockdowns"
  ON public.account_lockdowns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
