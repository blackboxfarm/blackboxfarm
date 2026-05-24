
-- =====================================================================
-- BlackBox Bot-Reply Aggregator
-- =====================================================================

-- 1. Channel role registry: maps Telegram chat_id → role in the pipeline
CREATE TABLE public.blackbox_channel_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('insiders_source', 'blackbox_group', 'output_channel')),
  chat_id bigint NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, chat_id)
);

CREATE INDEX idx_blackbox_channel_config_chatid ON public.blackbox_channel_config (chat_id) WHERE enabled = true;
CREATE INDEX idx_blackbox_channel_config_role ON public.blackbox_channel_config (role) WHERE enabled = true;

ALTER TABLE public.blackbox_channel_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage blackbox channel config"
  ON public.blackbox_channel_config
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2. Aggregator runs: one row per CA detected from the insiders source
CREATE TABLE public.blackbox_aggregator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  source_chat_id bigint NOT NULL,
  source_message_id bigint,
  source_raw_text text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  ca_posted_at timestamptz,
  ca_post_message_id bigint,
  harvest_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'harvesting', 'composing', 'published', 'failed', 'skipped')),
  digest_message_id bigint,
  digest_text text,
  digest_jsonb jsonb,
  replies_collected int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blackbox_runs_status ON public.blackbox_aggregator_runs (status, harvest_until);
CREATE INDEX idx_blackbox_runs_mint ON public.blackbox_aggregator_runs (token_mint, posted_at DESC);
CREATE INDEX idx_blackbox_runs_recent ON public.blackbox_aggregator_runs (posted_at DESC);

ALTER TABLE public.blackbox_aggregator_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view aggregator runs"
  ON public.blackbox_aggregator_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 3. Raw bot replies harvested from the BlackBox group
CREATE TABLE public.blackbox_bot_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.blackbox_aggregator_runs(id) ON DELETE CASCADE,
  message_id bigint NOT NULL,
  bot_username text,
  bot_user_id bigint,
  raw_text text NOT NULL,
  parsed_jsonb jsonb,
  parser_used text,
  received_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  edit_count int NOT NULL DEFAULT 0,
  UNIQUE (run_id, message_id)
);

CREATE INDEX idx_blackbox_replies_run ON public.blackbox_bot_replies (run_id, received_at);
CREATE INDEX idx_blackbox_replies_bot ON public.blackbox_bot_replies (bot_username);

ALTER TABLE public.blackbox_bot_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view bot replies"
  ON public.blackbox_bot_replies
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 4. updated_at triggers
CREATE TRIGGER trg_blackbox_channel_config_updated
  BEFORE UPDATE ON public.blackbox_channel_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_blackbox_runs_updated
  BEFORE UPDATE ON public.blackbox_aggregator_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
