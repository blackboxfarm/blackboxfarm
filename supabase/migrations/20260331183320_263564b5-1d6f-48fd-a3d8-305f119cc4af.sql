
CREATE TABLE public.twitter_tg_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL UNIQUE,
  display_name text,
  bio text,
  followers integer DEFAULT 0,
  telegram_links jsonb DEFAULT '[]'::jsonb,
  last_scanned_at timestamptz,
  scan_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  priority_score integer DEFAULT 0,
  notes text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.twitter_tg_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on twitter_tg_targets"
  ON public.twitter_tg_targets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_twitter_tg_targets_handle ON public.twitter_tg_targets (handle);
CREATE INDEX idx_twitter_tg_targets_priority ON public.twitter_tg_targets (priority_score DESC);
