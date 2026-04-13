
CREATE TABLE public.telegram_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id text NOT NULL,
  username text,
  feedback_text text NOT NULL,
  platform text NOT NULL DEFAULT 'telegram',
  linked_user_id uuid,
  is_tester boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all telegram feedback"
  ON public.telegram_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_telegram_feedback_tg_user ON public.telegram_feedback (telegram_user_id);
CREATE INDEX idx_telegram_feedback_created ON public.telegram_feedback (created_at DESC);
