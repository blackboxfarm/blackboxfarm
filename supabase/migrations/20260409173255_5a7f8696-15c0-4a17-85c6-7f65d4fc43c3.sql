
-- Unified chat history linking TG + web chats per account
CREATE TABLE public.unified_chat_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'web')),
  account_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id TEXT,
  web_session_id TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  token_count INTEGER,
  cost_estimate_usd NUMERIC(10,6) DEFAULT 0,
  model_used TEXT,
  response_time_ms INTEGER,
  source_message_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_unified_chat_account ON public.unified_chat_history(account_user_id);
CREATE INDEX idx_unified_chat_platform ON public.unified_chat_history(platform);
CREATE INDEX idx_unified_chat_created ON public.unified_chat_history(created_at DESC);
CREATE INDEX idx_unified_chat_tg_user ON public.unified_chat_history(telegram_user_id);
CREATE INDEX idx_unified_chat_web_session ON public.unified_chat_history(web_session_id);

-- Enable RLS
ALTER TABLE public.unified_chat_history ENABLE ROW LEVEL SECURITY;

-- Only super admins can read (using the existing has_role pattern)
CREATE POLICY "Admins can view all unified chat history"
ON public.unified_chat_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert unified chat history"
ON public.unified_chat_history
FOR INSERT
TO authenticated
WITH CHECK (true);
