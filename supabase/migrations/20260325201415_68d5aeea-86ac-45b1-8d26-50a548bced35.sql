CREATE TABLE public.checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  stripe_session_id text,
  price_id text NOT NULL,
  tier_key text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  reminded_at timestamptz,
  reminder_count int DEFAULT 0
);

ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkout intents"
  ON public.checkout_intents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert checkout intents"
  ON public.checkout_intents FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update checkout intents"
  ON public.checkout_intents FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Admins can view all checkout intents"
  ON public.checkout_intents FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_checkout_intents_user_status ON public.checkout_intents(user_id, status);
CREATE INDEX idx_checkout_intents_created ON public.checkout_intents(created_at DESC);