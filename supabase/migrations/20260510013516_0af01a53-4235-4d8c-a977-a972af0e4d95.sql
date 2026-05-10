REFRESH MATERIALIZED VIEW public.mesh_summary;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-mesh-summary');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-mesh-summary',
  '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW public.mesh_summary; $$
);

CREATE OR REPLACE FUNCTION public.count_rotation_patterns(min_communities integer DEFAULT 2)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH account_stats AS (
    SELECT
      rm.source_id,
      COUNT(*) FILTER (WHERE rm.relationship = 'admin_of') AS admin_cnt,
      COUNT(*) FILTER (WHERE rm.relationship = 'mod_of')   AS mod_cnt
    FROM reputation_mesh rm
    WHERE rm.source_type = 'x_account'
      AND rm.relationship IN ('admin_of', 'mod_of', 'co_mod')
    GROUP BY rm.source_id
  )
  SELECT COUNT(*)::bigint FROM account_stats
  WHERE (admin_cnt + mod_cnt) >= min_communities;
$$;