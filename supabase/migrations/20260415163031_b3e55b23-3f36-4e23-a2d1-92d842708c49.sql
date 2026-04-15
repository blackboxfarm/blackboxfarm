
CREATE TABLE public.telegram_announcement_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_text TEXT NOT NULL,
  audiences TEXT[] NOT NULL DEFAULT '{}',
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_announcement_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view announcement logs"
  ON public.telegram_announcement_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert announcement logs"
  ON public.telegram_announcement_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access to announcement logs"
  ON public.telegram_announcement_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
