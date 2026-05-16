-- Add broadcast dedupe column + DrRick chat ID setting for mint alerts
ALTER TABLE public.allstar_mint_alerts
  ADD COLUMN IF NOT EXISTS tg_broadcasted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_allstar_mint_alerts_token_broadcast
  ON public.allstar_mint_alerts (token_mint, tg_broadcasted_at);

INSERT INTO public.system_settings (key, value, updated_by)
VALUES ('drrick_dm_chat_id', '5549703183'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, updated_by)
VALUES ('mint_alert_dedupe_window_hours', '24'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;