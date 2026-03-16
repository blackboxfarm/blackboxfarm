
-- Track getUpdates offset for funnel feed bot polling
CREATE TABLE IF NOT EXISTS public.funnel_feed_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.funnel_feed_bot_state (id, update_offset) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Raw captured messages from channels for dedup
CREATE TABLE IF NOT EXISTS public.funnel_feed_raw_messages (
  id bigserial PRIMARY KEY,
  update_id bigint UNIQUE NOT NULL,
  chat_id text NOT NULL,
  message_id bigint NOT NULL,
  message_text text,
  message_date timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ffraw_chat_id ON public.funnel_feed_raw_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_ffraw_processed ON public.funnel_feed_raw_messages (processed) WHERE NOT processed;

-- RLS
ALTER TABLE public.funnel_feed_bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_feed_raw_messages ENABLE ROW LEVEL SECURITY;

-- Only service_role can access these
CREATE POLICY "Service role only" ON public.funnel_feed_bot_state FOR ALL USING (false);
CREATE POLICY "Service role only" ON public.funnel_feed_raw_messages FOR ALL USING (false);
