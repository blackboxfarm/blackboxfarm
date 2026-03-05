
CREATE TABLE public.telegram_bot_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id text NOT NULL,
  command text NOT NULL,
  token_mint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_bot_usage_user_cmd ON public.telegram_bot_usage (telegram_user_id, command, created_at DESC);

ALTER TABLE public.telegram_bot_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.telegram_bot_usage
  FOR ALL USING (false);
