
CREATE TABLE public.ai_user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id text,
  session_id text,
  preferred_name text,
  language_preference text DEFAULT 'en',
  interests text[] DEFAULT '{}',
  notes jsonb DEFAULT '{}',
  interaction_count integer DEFAULT 0,
  last_platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_user_memory_user_id ON public.ai_user_memory (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ai_user_memory_tg_id ON public.ai_user_memory (telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX idx_ai_user_memory_session ON public.ai_user_memory (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.ai_user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory" ON public.ai_user_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access" ON public.ai_user_memory
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_ai_user_memory_updated_at
  BEFORE UPDATE ON public.ai_user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
