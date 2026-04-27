
CREATE TABLE IF NOT EXISTS public.bubble_map_anon_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash TEXT NOT NULL,
  ip_hash TEXT,
  visitor_hash TEXT,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count INTEGER NOT NULL DEFAULT 0,
  user_agent_short TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bubble_map_anon_usage_unique UNIQUE (identifier_hash, day)
);

CREATE INDEX IF NOT EXISTS idx_bm_anon_usage_day ON public.bubble_map_anon_usage(day);
CREATE INDEX IF NOT EXISTS idx_bm_anon_usage_ip_day ON public.bubble_map_anon_usage(ip_hash, day);

ALTER TABLE public.bubble_map_anon_usage ENABLE ROW LEVEL SECURITY;

-- No public policies: only service role (edge functions) may read/write.

CREATE OR REPLACE FUNCTION public.cleanup_bubble_map_anon_usage()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.bubble_map_anon_usage WHERE day < (now() AT TIME ZONE 'utc')::date - INTERVAL '7 days';
$$;
