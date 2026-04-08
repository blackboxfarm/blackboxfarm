
CREATE TABLE public.web_chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_fingerprint TEXT,
  session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tier TEXT DEFAULT 'anon',
  page_path TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  first_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_type TEXT,
  browser TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.web_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_web_chat_sessions_fingerprint ON public.web_chat_sessions(visitor_fingerprint);
CREATE INDEX idx_web_chat_sessions_session ON public.web_chat_sessions(session_id);
CREATE INDEX idx_web_chat_sessions_user ON public.web_chat_sessions(user_id);
CREATE INDEX idx_web_chat_sessions_last_msg ON public.web_chat_sessions(last_message_at DESC);

CREATE POLICY "Service role full access" ON public.web_chat_sessions
  FOR ALL USING (true) WITH CHECK (true);
