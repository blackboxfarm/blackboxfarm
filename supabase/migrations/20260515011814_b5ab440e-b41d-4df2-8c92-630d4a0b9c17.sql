
CREATE TABLE IF NOT EXISTS public.recycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('community','handle')),
  entity_id text NOT NULL,
  prev_token_mint text,
  new_token_mint text,
  prev_community_id text,
  new_community_id text,
  prev_label_snapshot jsonb,
  new_label_snapshot jsonb,
  dev_wallet text,
  kyc_root text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','yellow','red')),
  triggered_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recycle_events_unique_link
  ON public.recycle_events (
    entity_type,
    entity_id,
    COALESCE(new_token_mint,''),
    COALESCE(new_community_id,'')
  );

CREATE INDEX IF NOT EXISTS recycle_events_entity_idx
  ON public.recycle_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recycle_events_severity_idx
  ON public.recycle_events (severity, created_at DESC);

ALTER TABLE public.recycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read recycle_events"
  ON public.recycle_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
