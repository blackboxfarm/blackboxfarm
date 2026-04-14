
DROP VIEW IF EXISTS public.intel_briefing_view_stats;

CREATE OR REPLACE VIEW public.intel_briefing_view_stats AS
SELECT
  briefing_id,
  slug,
  COUNT(*) FILTER (WHERE visitor_type = 'human') AS human_views,
  COUNT(*) FILTER (WHERE visitor_type = 'crawler') AS crawler_hits,
  COUNT(*) FILTER (WHERE visitor_type = 'ai_bot') AS ai_bot_hits,
  COUNT(*) AS total_views,
  jsonb_object_agg(bot_name, bot_cnt) FILTER (WHERE bot_name IS NOT NULL) AS bot_breakdown
FROM (
  SELECT
    briefing_id,
    slug,
    visitor_type,
    bot_name,
    COUNT(*) OVER (PARTITION BY briefing_id, bot_name) AS bot_cnt
  FROM public.intel_briefing_views
) sub
GROUP BY briefing_id, slug;
