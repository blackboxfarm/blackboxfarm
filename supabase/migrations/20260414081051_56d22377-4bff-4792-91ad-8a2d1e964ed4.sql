
-- Track views/crawls/bot hits per intel briefing
CREATE TABLE public.intel_briefing_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID REFERENCES public.intel_briefings(id) ON DELETE CASCADE NOT NULL,
  slug TEXT NOT NULL,
  visitor_type TEXT NOT NULL DEFAULT 'human', -- 'human', 'crawler', 'ai_bot'
  bot_name TEXT, -- e.g. 'googlebot', 'facebookexternalhit', 'chatgpt-user', 'claudebot'
  user_agent TEXT,
  ip_address TEXT,
  referer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast aggregation per briefing
CREATE INDEX idx_briefing_views_briefing_id ON public.intel_briefing_views(briefing_id);
CREATE INDEX idx_briefing_views_visitor_type ON public.intel_briefing_views(visitor_type);
CREATE INDEX idx_briefing_views_created_at ON public.intel_briefing_views(created_at);

-- RLS: service role inserts, admins can read
ALTER TABLE public.intel_briefing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert views"
  ON public.intel_briefing_views FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Authenticated users can read views"
  ON public.intel_briefing_views FOR SELECT
  TO authenticated USING (true);

-- Aggregate view for quick dashboard queries
CREATE OR REPLACE VIEW public.intel_briefing_view_stats AS
SELECT
  briefing_id,
  slug,
  COUNT(*) FILTER (WHERE visitor_type = 'human') AS human_views,
  COUNT(*) FILTER (WHERE visitor_type = 'crawler') AS crawler_hits,
  COUNT(*) FILTER (WHERE visitor_type = 'ai_bot') AS ai_bot_hits,
  COUNT(*) AS total_views,
  jsonb_object_agg(
    COALESCE(bot_name, 'unknown'),
    bot_count
  ) FILTER (WHERE bot_name IS NOT NULL) AS bot_breakdown
FROM public.intel_briefing_views
LEFT JOIN LATERAL (
  SELECT bot_name AS bn, COUNT(*) AS bot_count
  FROM public.intel_briefing_views v2
  WHERE v2.briefing_id = intel_briefing_views.briefing_id
    AND v2.bot_name IS NOT NULL
  GROUP BY v2.bot_name
) sub ON true
GROUP BY briefing_id, slug;
