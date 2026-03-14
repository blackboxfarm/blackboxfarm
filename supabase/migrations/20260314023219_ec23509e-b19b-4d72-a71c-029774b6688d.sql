-- Channel alert configuration: per-group toggles for each alert type
CREATE TABLE public.channel_alert_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  alert_type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  enabled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chat_id, alert_type)
);

CREATE INDEX idx_channel_alert_config_type_enabled ON public.channel_alert_config (alert_type, is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_channel_alert_config_chat_id ON public.channel_alert_config (chat_id);

CREATE TRIGGER update_channel_alert_config_updated_at
  BEFORE UPDATE ON public.channel_alert_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.channel_alert_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.channel_alert_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);