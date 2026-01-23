-- Create table to track tokens we've already seen/reported on
CREATE TABLE public.holders_intel_seen_tokens (
  token_mint TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_slot TEXT NOT NULL, -- e.g., "2024-01-23_18:00"
  times_seen INTEGER NOT NULL DEFAULT 1,
  was_posted BOOLEAN NOT NULL DEFAULT false,
  market_cap_at_discovery NUMERIC,
  health_grade TEXT
);

-- Create index for filtering by snapshot slot
CREATE INDEX idx_holders_intel_seen_tokens_snapshot ON public.holders_intel_seen_tokens(snapshot_slot);
CREATE INDEX idx_holders_intel_seen_tokens_last_seen ON public.holders_intel_seen_tokens(last_seen_at);

-- Create post queue table
CREATE TABLE public.holders_intel_post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'posted', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  tweet_id TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  market_cap NUMERIC,
  snapshot_slot TEXT
);

-- Create indexes for queue processing
CREATE INDEX idx_holders_intel_post_queue_status ON public.holders_intel_post_queue(status);
CREATE INDEX idx_holders_intel_post_queue_scheduled ON public.holders_intel_post_queue(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.holders_intel_seen_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holders_intel_post_queue ENABLE ROW LEVEL SECURITY;

-- Allow super admins to view/manage
CREATE POLICY "Super admins can manage seen tokens"
  ON public.holders_intel_seen_tokens
  FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage post queue"
  ON public.holders_intel_post_queue
  FOR ALL
  USING (public.is_super_admin(auth.uid()));

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role can manage seen tokens"
  ON public.holders_intel_seen_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage post queue"
  ON public.holders_intel_post_queue
  FOR ALL
  USING (auth.role() = 'service_role');