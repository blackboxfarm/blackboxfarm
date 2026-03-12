
CREATE TABLE public.telegram_channel_registry (
  channel_id text PRIMARY KEY,
  current_username text,
  current_title text,
  username_history jsonb DEFAULT '[]'::jsonb,
  title_history jsonb DEFAULT '[]'::jsonb,
  linked_token_count integer DEFAULT 0,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

CREATE INDEX idx_telegram_channel_username ON public.telegram_channel_registry(current_username);

ALTER TABLE public.telegram_channel_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON public.telegram_channel_registry
  FOR ALL USING (true) WITH CHECK (true);
