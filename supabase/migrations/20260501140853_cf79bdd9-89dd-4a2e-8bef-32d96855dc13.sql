-- ── vulture_accounts ─────────────────────────────────────────
CREATE TABLE public.vulture_accounts (
  handle text PRIMARY KEY,
  display_name text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  total_sightings int NOT NULL DEFAULT 0,
  distinct_tokens int NOT NULL DEFAULT 0,
  vulture_kinds text[] NOT NULL DEFAULT '{}',
  confidence_avg int NOT NULL DEFAULT 0,
  is_likely_bot boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vulture_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read vulture_accounts"
  ON public.vulture_accounts FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── vulture_sightings ────────────────────────────────────────
CREATE TABLE public.vulture_sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text,
  candidate_id uuid,
  community_id text,
  handle text NOT NULL,
  display_name text,
  post_url text,
  post_text text,
  posted_at timestamptz,
  vulture_kind text NOT NULL,
  scam_urls text[] NOT NULL DEFAULT '{}',
  ai_confidence int NOT NULL DEFAULT 0,
  ai_reason text,
  raw_post jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vulture_sightings_token ON public.vulture_sightings (token_mint);
CREATE INDEX idx_vulture_sightings_candidate ON public.vulture_sightings (candidate_id);
CREATE INDEX idx_vulture_sightings_handle ON public.vulture_sightings (handle);
CREATE INDEX idx_vulture_sightings_community ON public.vulture_sightings (community_id);

ALTER TABLE public.vulture_sightings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read vulture_sightings"
  ON public.vulture_sightings FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── vulture_lookalike_domains ────────────────────────────────
CREATE TABLE public.vulture_lookalike_domains (
  domain text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'lookalike',
  added_by text,
  notes text,
  added_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vulture_lookalike_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read vulture_lookalike_domains"
  ON public.vulture_lookalike_domains FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Seed known pump.fun lookalike phishing domains
INSERT INTO public.vulture_lookalike_domains (domain, kind, added_by, notes) VALUES
  ('pumpem.fun', 'lookalike', 'system', 'Wallet drainer impersonating pump.fun (observed in $UNCRAFT community)'),
  ('pump-fun.app', 'lookalike', 'system', 'Wallet drainer lookalike'),
  ('pump.fun.live', 'lookalike', 'system', 'Fake live-stream phishing domain'),
  ('pumpfun.live', 'lookalike', 'system', 'Fake live-stream phishing domain'),
  ('pump-fun.live', 'lookalike', 'system', 'Fake live-stream phishing domain'),
  ('pump-fun.com', 'lookalike', 'system', 'Lookalike domain'),
  ('pumpfun.app', 'lookalike', 'system', 'Lookalike domain'),
  ('pumpfun-live.com', 'lookalike', 'system', 'Fake live-stream phishing domain')
ON CONFLICT (domain) DO NOTHING;

-- updated_at trigger for vulture_accounts
CREATE TRIGGER trg_vulture_accounts_updated_at
  BEFORE UPDATE ON public.vulture_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();