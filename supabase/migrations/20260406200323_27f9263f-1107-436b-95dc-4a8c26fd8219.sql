-- Backfill: ensure all admin_config fields exist with proper defaults
-- This merges defaults under the existing values so user-set values are preserved
UPDATE public.channel_installations
SET admin_config = jsonb_build_object(
  'delay_ms', COALESCE((admin_config->>'delay_ms')::int, 3000),
  'verbose', COALESCE((admin_config->>'verbose')::boolean, false),
  'admin_only_commands', COALESCE((admin_config->>'admin_only_commands')::boolean, false),
  'dev_wallet_alerts', COALESCE((admin_config->>'dev_wallet_alerts')::boolean, false),
  'enabled_tiers', COALESCE(admin_config->'enabled_tiers', '[]'::jsonb)
)
WHERE admin_config IS NULL
   OR NOT (admin_config ? 'verbose')
   OR NOT (admin_config ? 'admin_only_commands')
   OR NOT (admin_config ? 'dev_wallet_alerts')
   OR NOT (admin_config ? 'enabled_tiers');

-- Update the column default to include ALL fields
ALTER TABLE public.channel_installations
ALTER COLUMN admin_config SET DEFAULT '{"delay_ms": 3000, "verbose": false, "admin_only_commands": false, "enabled_tiers": [], "dev_wallet_alerts": false}'::jsonb;