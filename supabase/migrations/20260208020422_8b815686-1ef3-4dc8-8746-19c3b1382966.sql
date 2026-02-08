-- Oracle System: reputation_mesh table for entity relationships
CREATE TABLE public.reputation_mesh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,  -- 'wallet', 'x_account', 'token', 'x_community'
  source_id TEXT NOT NULL,
  linked_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  relationship TEXT NOT NULL, -- 'created', 'modded', 'funded', 'co_mod', 'promoted', 'same_team'
  confidence INTEGER DEFAULT 100,
  evidence JSONB,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  discovered_via TEXT, -- 'public_query', 'hourly_scan', 'backfill', 'manual'
  UNIQUE(source_type, source_id, linked_type, linked_id, relationship)
);

-- Indexes for fast lookups
CREATE INDEX idx_mesh_source ON reputation_mesh(source_type, source_id);
CREATE INDEX idx_mesh_linked ON reputation_mesh(linked_type, linked_id);
CREATE INDEX idx_mesh_relationship ON reputation_mesh(relationship);
CREATE INDEX idx_mesh_discovered_at ON reputation_mesh(discovered_at DESC);

-- Enable RLS
ALTER TABLE public.reputation_mesh ENABLE ROW LEVEL SECURITY;

-- Public read access (this is public reputation data)
CREATE POLICY "Public read access to reputation mesh"
ON public.reputation_mesh FOR SELECT USING (true);

-- Service role can insert/update
CREATE POLICY "Service role can manage reputation mesh"
ON public.reputation_mesh FOR ALL USING (true);

-- Oracle System: backfill jobs tracking table
CREATE TABLE public.oracle_backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date DATE NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'no_archive', 'failed'
  tokens_found INTEGER DEFAULT 0,
  tokens_scanned INTEGER DEFAULT 0,
  new_devs_discovered INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backfill_status ON oracle_backfill_jobs(status);
CREATE INDEX idx_backfill_date ON oracle_backfill_jobs(target_date DESC);

-- Enable RLS
ALTER TABLE public.oracle_backfill_jobs ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY "Public read access to backfill jobs"
ON public.oracle_backfill_jobs FOR SELECT USING (true);

CREATE POLICY "Service role can manage backfill jobs"
ON public.oracle_backfill_jobs FOR ALL USING (true);

-- Add auto-classification columns to blacklist
ALTER TABLE public.pumpfun_blacklist ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pumpfun_blacklist ADD COLUMN IF NOT EXISTS classification_score NUMERIC;
ALTER TABLE public.pumpfun_blacklist ADD COLUMN IF NOT EXISTS recommendation_text TEXT;

-- Add auto-classification columns to whitelist
ALTER TABLE public.pumpfun_whitelist ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pumpfun_whitelist ADD COLUMN IF NOT EXISTS classification_score NUMERIC;
ALTER TABLE public.pumpfun_whitelist ADD COLUMN IF NOT EXISTS recommendation_text TEXT;

-- Track when tokens were analyzed by Oracle
ALTER TABLE public.token_lifecycle ADD COLUMN IF NOT EXISTS oracle_analyzed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.token_lifecycle ADD COLUMN IF NOT EXISTS oracle_analyzed_at TIMESTAMPTZ;
ALTER TABLE public.token_lifecycle ADD COLUMN IF NOT EXISTS oracle_score NUMERIC;