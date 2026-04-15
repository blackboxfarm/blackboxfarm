
CREATE TABLE public.telegram_announcement_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.telegram_announcement_log(id) ON DELETE CASCADE NOT NULL,
  telegram_user_id text NOT NULL,
  linked_user_id uuid,
  delivery_status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcement_recipients_announcement ON public.telegram_announcement_recipients(announcement_id);
CREATE INDEX idx_announcement_recipients_tg_user ON public.telegram_announcement_recipients(telegram_user_id);

ALTER TABLE public.telegram_announcement_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view announcement recipients"
  ON public.telegram_announcement_recipients
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
