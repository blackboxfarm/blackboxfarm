CREATE TABLE public.bubble_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  token_address TEXT NOT NULL,
  ticker TEXT,
  view_mode TEXT NOT NULL CHECK (view_mode IN ('bubble','schematic')),
  public_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  commentary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_bubble_snapshots_token ON public.bubble_snapshots(token_address);
CREATE INDEX idx_bubble_snapshots_user  ON public.bubble_snapshots(user_id);
CREATE INDEX idx_bubble_snapshots_created ON public.bubble_snapshots(created_at DESC);

ALTER TABLE public.bubble_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read so OG link-unfurls + share pages can resolve without auth
CREATE POLICY "Bubble snapshots are publicly readable"
  ON public.bubble_snapshots
  FOR SELECT
  USING (true);

-- No client-side INSERT/UPDATE/DELETE; only the edge function (service role) writes.
