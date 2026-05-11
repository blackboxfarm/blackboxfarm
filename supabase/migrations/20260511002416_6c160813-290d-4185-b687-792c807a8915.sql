CREATE TABLE IF NOT EXISTS public.creator_backfill_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL DEFAULT 'backfill-creator-wallets-solscan',
  mint text NOT NULL,
  table_name text,
  column_name text,
  solscan_url text,
  http_status int,
  duration_ms int,
  from_cache boolean DEFAULT false,
  resolved_creator text,
  error_message text,
  response_preview jsonb
);

CREATE INDEX IF NOT EXISTS creator_backfill_events_created_at_idx
  ON public.creator_backfill_events (created_at DESC);
CREATE INDEX IF NOT EXISTS creator_backfill_events_mint_idx
  ON public.creator_backfill_events (mint);

ALTER TABLE public.creator_backfill_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins_read_creator_backfill_events"
  ON public.creator_backfill_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role_writes_creator_backfill_events"
  ON public.creator_backfill_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.prune_creator_backfill_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (random() < 0.02) THEN
    DELETE FROM public.creator_backfill_events
    WHERE id IN (
      SELECT id FROM public.creator_backfill_events
      ORDER BY created_at DESC
      OFFSET 5000
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_creator_backfill_events ON public.creator_backfill_events;
CREATE TRIGGER trg_prune_creator_backfill_events
AFTER INSERT ON public.creator_backfill_events
FOR EACH ROW EXECUTE FUNCTION public.prune_creator_backfill_events();

ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_backfill_events;