-- Add source tracking to developer_profiles
ALTER TABLE developer_profiles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add flipit_position_id to developer_tokens for tracking trade outcomes
ALTER TABLE developer_tokens ADD COLUMN IF NOT EXISTS flipit_position_id UUID;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_developer_tokens_flipit_position_id ON developer_tokens(flipit_position_id);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_source ON developer_profiles(source);