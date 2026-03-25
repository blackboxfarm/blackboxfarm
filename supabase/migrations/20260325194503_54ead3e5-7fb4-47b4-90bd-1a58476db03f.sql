-- telegram_bot_interactions — rich log of every bot conversation
CREATE TABLE public.telegram_bot_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id text NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  chat_id bigint NOT NULL,
  chat_type text NOT NULL DEFAULT 'private',
  command text,
  args_preview text,
  token_mint text,
  linked_user_id uuid,
  response_status text NOT NULL DEFAULT 'success',
  is_new_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_interactions_user ON public.telegram_bot_interactions (telegram_user_id, created_at DESC);
CREATE INDEX idx_tg_interactions_created ON public.telegram_bot_interactions (created_at DESC);
CREATE INDEX idx_tg_interactions_command ON public.telegram_bot_interactions (command, created_at DESC);

ALTER TABLE public.telegram_bot_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_insert_interactions" ON public.telegram_bot_interactions
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "super_admin_select_interactions" ON public.telegram_bot_interactions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- telegram_channel_members — join/leave activity log
CREATE TABLE public.telegram_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  chat_title text,
  telegram_user_id text NOT NULL,
  telegram_username text,
  first_name text,
  last_name text,
  event_type text NOT NULL,
  invited_by_user_id text,
  old_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_members_chat ON public.telegram_channel_members (chat_id, created_at DESC);
CREATE INDEX idx_tg_members_created ON public.telegram_channel_members (created_at DESC);
CREATE INDEX idx_tg_members_event ON public.telegram_channel_members (event_type, created_at DESC);

ALTER TABLE public.telegram_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_insert_members" ON public.telegram_channel_members
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "super_admin_select_members" ON public.telegram_channel_members
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));