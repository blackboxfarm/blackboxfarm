-- =============================================
-- PART 1: SCALING INDEXES FOR reputation_mesh
-- =============================================

-- Index for queries filtering by source_type and relationship
CREATE INDEX IF NOT EXISTS idx_mesh_source_rel 
  ON reputation_mesh(source_type, relationship);

-- Index for queries filtering by linked_type and relationship  
CREATE INDEX IF NOT EXISTS idx_mesh_linked_rel 
  ON reputation_mesh(linked_type, relationship);

-- Partial index for X account queries (most common)
CREATE INDEX IF NOT EXISTS idx_mesh_source_id_rel 
  ON reputation_mesh(source_id, relationship) 
  WHERE source_type = 'x_account';

-- Index for community lookups
CREATE INDEX IF NOT EXISTS idx_mesh_linked_id_community
  ON reputation_mesh(linked_id)
  WHERE linked_type = 'x_community';

-- =============================================
-- PART 2: SERVER-SIDE ROTATION DETECTION FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION get_rotation_patterns(
  min_communities INT DEFAULT 2,
  result_limit INT DEFAULT 50,
  result_offset INT DEFAULT 0
)
RETURNS TABLE (
  account TEXT,
  admin_communities TEXT[],
  mod_communities TEXT[],
  co_mod_count BIGINT,
  total_communities BIGINT,
  risk_score INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH account_stats AS (
    SELECT 
      rm.source_id,
      ARRAY_AGG(DISTINCT rm.linked_id) FILTER (WHERE rm.relationship = 'admin_of') as admin_comms,
      ARRAY_AGG(DISTINCT rm.linked_id) FILTER (WHERE rm.relationship = 'mod_of') as mod_comms,
      COUNT(*) FILTER (WHERE rm.relationship = 'co_mod') as co_mod_cnt
    FROM reputation_mesh rm
    WHERE rm.source_type = 'x_account'
      AND rm.relationship IN ('admin_of', 'mod_of', 'co_mod')
    GROUP BY rm.source_id
  )
  SELECT 
    a.source_id as account,
    COALESCE(a.admin_comms, ARRAY[]::TEXT[]) as admin_communities,
    COALESCE(a.mod_comms, ARRAY[]::TEXT[]) as mod_communities,
    a.co_mod_cnt as co_mod_count,
    (COALESCE(array_length(a.admin_comms, 1), 0) + COALESCE(array_length(a.mod_comms, 1), 0))::BIGINT as total_communities,
    -- Risk score: admin roles weighted 3x, mod roles 2x, co_mod connections 1x each
    (COALESCE(array_length(a.admin_comms, 1), 0) * 30 + 
     COALESCE(array_length(a.mod_comms, 1), 0) * 20 + 
     LEAST(a.co_mod_cnt::INT, 20) * 5)::INT as risk_score
  FROM account_stats a
  WHERE (COALESCE(array_length(a.admin_comms, 1), 0) + COALESCE(array_length(a.mod_comms, 1), 0)) >= min_communities
  ORDER BY risk_score DESC, total_communities DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- =============================================
-- PART 3: MATERIALIZED VIEW FOR MESH STATS
-- =============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mesh_summary AS
SELECT 
  COUNT(*)::BIGINT as total_links,
  COUNT(*) FILTER (WHERE relationship = 'admin_of')::BIGINT as admin_links,
  COUNT(*) FILTER (WHERE relationship = 'mod_of')::BIGINT as mod_links,
  COUNT(*) FILTER (WHERE relationship = 'co_mod')::BIGINT as co_mod_links,
  COUNT(*) FILTER (WHERE relationship = 'community_for')::BIGINT as token_links,
  COUNT(DISTINCT source_id) FILTER (WHERE source_type = 'x_account')::BIGINT as unique_accounts,
  COUNT(DISTINCT linked_id) FILTER (WHERE linked_type = 'x_community')::BIGINT as unique_communities,
  NOW() as last_refreshed
FROM reputation_mesh;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS mesh_summary_singleton ON mesh_summary ((1));

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_mesh_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mesh_summary;
END;
$$;

-- =============================================
-- PART 4: DEVELOPER MINT ALERTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS developer_mint_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES developer_profiles(id) ON DELETE SET NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  creator_wallet TEXT NOT NULL,
  launchpad TEXT, -- 'pump.fun', 'bags.fm', 'bonk.fun', etc.
  alert_type TEXT NOT NULL, -- 'blacklist_launch', 'whitelist_launch', 'neutral_launch'
  alert_level TEXT NOT NULL DEFAULT 'info', -- 'critical', 'warning', 'info', 'success'
  alert_sent_at TIMESTAMPTZ,
  telegram_sent BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  notified_users UUID[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE developer_mint_alerts ENABLE ROW LEVEL SECURITY;

-- Super admins can view all alerts
CREATE POLICY "Super admins can view all alerts" ON developer_mint_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- Super admins can insert alerts
CREATE POLICY "Super admins can insert alerts" ON developer_mint_alerts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access" ON developer_mint_alerts
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dev_alerts_developer ON developer_mint_alerts(developer_id);
CREATE INDEX IF NOT EXISTS idx_dev_alerts_token ON developer_mint_alerts(token_mint);
CREATE INDEX IF NOT EXISTS idx_dev_alerts_type ON developer_mint_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_dev_alerts_created ON developer_mint_alerts(created_at DESC);

-- =============================================
-- PART 5: ADD LAUNCHPAD COLUMN TO DEVELOPER_WALLETS
-- =============================================

ALTER TABLE developer_wallets 
ADD COLUMN IF NOT EXISTS launchpad_detected TEXT;

-- Add last_scanned_at for tracking rescan progress
ALTER TABLE developer_wallets 
ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ;

-- =============================================
-- PART 6: DAILY CRON FOR MESH SUMMARY REFRESH
-- =============================================

-- Schedule hourly refresh of mesh_summary
SELECT cron.schedule(
  'refresh-mesh-summary-hourly',
  '0 * * * *',
  $$SELECT refresh_mesh_summary()$$
);