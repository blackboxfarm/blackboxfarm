-- X Account Registry: maps immutable numeric X user IDs to mutable handles
CREATE TABLE public.x_account_registry (
  x_user_id text PRIMARY KEY,
  current_handle text,
  display_name text,
  is_verified boolean DEFAULT false,
  handle_history jsonb DEFAULT '[]'::jsonb,
  name_history jsonb DEFAULT '[]'::jsonb,
  linked_token_count integer DEFAULT 0,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

CREATE INDEX idx_x_account_registry_handle ON public.x_account_registry (current_handle);

ALTER TABLE public.x_account_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read x_account_registry"
  ON public.x_account_registry FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage x_account_registry"
  ON public.x_account_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);