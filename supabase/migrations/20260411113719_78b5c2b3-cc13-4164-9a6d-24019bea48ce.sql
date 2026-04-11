-- Table to store channel member audit snapshots
CREATE TABLE public.telegram_channel_member_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  chat_title text,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  is_bot boolean DEFAULT false,
  join_date timestamptz,
  participant_type text DEFAULT 'member',
  classification text DEFAULT 'unknown',
  audit_batch_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(audit_batch_id, telegram_user_id)
);

CREATE TABLE public.telegram_channel_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  chat_title text,
  total_members integer DEFAULT 0,
  seeded_count integer DEFAULT 0,
  organic_count integer DEFAULT 0,
  bot_count integer DEFAULT 0,
  unknown_count integer DEFAULT 0,
  seeded_threshold integer DEFAULT 2200,
  status text DEFAULT 'running',
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.telegram_channel_member_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_channel_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read member audit"
ON public.telegram_channel_member_audit
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read audit runs"
ON public.telegram_channel_audit_runs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));