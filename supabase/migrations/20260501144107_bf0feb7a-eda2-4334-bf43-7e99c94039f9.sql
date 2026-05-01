
CREATE TABLE IF NOT EXISTS public.community_dissent_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID,
  token_mint TEXT,
  community_id TEXT,
  signal_kind TEXT NOT NULL,
  handle TEXT,
  post_url TEXT,
  quote TEXT,
  posted_at TIMESTAMPTZ,
  ai_confidence INT DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dissent_candidate ON public.community_dissent_signals(candidate_id);
CREATE INDEX IF NOT EXISTS idx_dissent_token ON public.community_dissent_signals(token_mint);
CREATE INDEX IF NOT EXISTS idx_dissent_kind ON public.community_dissent_signals(signal_kind);

ALTER TABLE public.community_dissent_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all dissent signals"
  ON public.community_dissent_signals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role full access dissent"
  ON public.community_dissent_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
