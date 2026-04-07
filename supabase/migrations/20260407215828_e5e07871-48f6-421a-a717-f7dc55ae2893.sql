
CREATE TABLE public.web_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  page_path TEXT,
  user_tier TEXT DEFAULT 'anon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_web_chat_session ON public.web_chat_messages(session_id, created_at);
CREATE INDEX idx_web_chat_user ON public.web_chat_messages(user_id, created_at);
CREATE INDEX idx_web_chat_created ON public.web_chat_messages(created_at);

ALTER TABLE public.web_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own web chat messages"
  ON public.web_chat_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to web chat"
  ON public.web_chat_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
