ALTER TABLE token_lifecycle
  ADD COLUMN IF NOT EXISTS mint_socials_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS mint_socials_source text,
  ADD COLUMN IF NOT EXISTS dex_socials_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS dex_socials_source text,
  ADD COLUMN IF NOT EXISTS socials_discovery_status text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS community_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS community_discovery_result text DEFAULT 'not_checked';

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_socials_unchecked 
  ON token_lifecycle(socials_discovery_status) 
  WHERE socials_discovery_status = 'unchecked';

COMMENT ON COLUMN token_lifecycle.socials_discovery_status IS 'unchecked | checked_none_found | found_partial | found_complete';
COMMENT ON COLUMN token_lifecycle.community_discovery_result IS 'not_checked | no_community | found_community | found_other_socials';