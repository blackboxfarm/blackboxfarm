-- Add deletion tracking fields to x_communities
ALTER TABLE x_communities
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_alert_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS failed_scrape_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_existence_check_at TIMESTAMPTZ;

-- Index for finding deleted communities
CREATE INDEX IF NOT EXISTS idx_x_communities_deleted ON x_communities(is_deleted) WHERE is_deleted = true;

-- Index for health check queries
CREATE INDEX IF NOT EXISTS idx_x_communities_active ON x_communities(is_deleted, last_existence_check_at) WHERE is_deleted = false;