CREATE TABLE IF NOT EXISTS public.telegram_xlookup_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  used_on DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, used_on)
);
CREATE INDEX IF NOT EXISTS idx_tg_xlookup_usage_user_date ON public.telegram_xlookup_usage (telegram_user_id, used_on);
ALTER TABLE public.telegram_xlookup_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.telegram_xlookup_usage FOR ALL USING (false);