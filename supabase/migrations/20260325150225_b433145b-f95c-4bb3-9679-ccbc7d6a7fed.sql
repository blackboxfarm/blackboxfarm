ALTER TABLE holders_intel_templates ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE TABLE IF NOT EXISTS holders_intel_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO holders_intel_config (key, value) VALUES 
  ('template_mode', 'active_only'),
  ('last_used_template', 'large')
ON CONFLICT (key) DO NOTHING;