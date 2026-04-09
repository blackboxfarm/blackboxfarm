
-- 1. Harden telegram link: unique constraint on telegram_user_id (where not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_link_codes_tg_user_unique 
ON public.telegram_link_codes (telegram_user_id) 
WHERE telegram_user_id IS NOT NULL;

-- 2. Add secondary email columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS secondary_email text,
ADD COLUMN IF NOT EXISTS secondary_email_verified boolean NOT NULL DEFAULT false;

-- 3. Email preferences table
CREATE TABLE IF NOT EXISTS public.email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketing boolean NOT NULL DEFAULT true,
  product_updates boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email preferences"
ON public.email_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own email preferences"
ON public.email_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email preferences"
ON public.email_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4. Marketing email campaigns table
CREATE TABLE IF NOT EXISTS public.marketing_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  html_content text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'one_time',
  funnel_tag text,
  target_intent_level text,
  is_active boolean NOT NULL DEFAULT false,
  send_delay_hours integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage campaigns"
ON public.marketing_email_campaigns FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- 5. Marketing email queue table
CREATE TABLE IF NOT EXISTS public.marketing_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_email_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);

ALTER TABLE public.marketing_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage email queue"
ON public.marketing_email_queue FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.marketing_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON public.marketing_email_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_email_prefs_user ON public.email_preferences(user_id);
