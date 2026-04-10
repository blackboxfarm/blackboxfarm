
CREATE TABLE public.bot_chat_settings (
  chat_id BIGINT PRIMARY KEY,
  ca_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_chat_settings ENABLE ROW LEVEL SECURITY;

-- Only service_role can access this table (edge functions use service role)
CREATE POLICY "Service role full access"
ON public.bot_chat_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
