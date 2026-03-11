
-- Mesh Spider Queue: entities discovered passively that need deeper spidering
CREATE TABLE IF NOT EXISTS public.mesh_spider_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'wallet', 'token', 'x_account'
  source TEXT NOT NULL, -- which function discovered this
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
  priority INTEGER NOT NULL DEFAULT 0, -- higher = more urgent
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary JSONB,
  error_message TEXT,
  links_discovered INTEGER DEFAULT 0,
  UNIQUE(entity_id, entity_type)
);

-- Index for the background processor to pick up pending work
CREATE INDEX IF NOT EXISTS idx_mesh_spider_queue_pending 
  ON public.mesh_spider_queue(status, priority DESC, queued_at ASC) 
  WHERE status = 'pending';

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_mesh_spider_queue_entity 
  ON public.mesh_spider_queue(entity_id, entity_type);

-- RLS: service role only (edge functions)
ALTER TABLE public.mesh_spider_queue ENABLE ROW LEVEL SECURITY;
