-- Table to store group chat messages passively captured by the bot
CREATE TABLE public.telegram_group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  message_text TEXT,
  message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-group lookups
CREATE INDEX idx_tg_group_messages_chat_created ON public.telegram_group_messages (chat_id, created_at DESC);

-- Index for retention cleanup
CREATE INDEX idx_tg_group_messages_created ON public.telegram_group_messages (created_at);

-- Enable RLS
ALTER TABLE public.telegram_group_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (admin dashboard)
CREATE POLICY "Authenticated users can view group messages"
  ON public.telegram_group_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert (edge function webhook)
CREATE POLICY "Service role can insert group messages"
  ON public.telegram_group_messages
  FOR INSERT
  TO service_role
  WITH CHECK (true);