ALTER TABLE public.holders_intel_post_queue
  ADD COLUMN IF NOT EXISTS autopsy_slug text,
  ADD COLUMN IF NOT EXISTS autopsy_url text,
  ADD COLUMN IF NOT EXISTS autopsy_hero_image text,
  ADD COLUMN IF NOT EXISTS autopsy_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopsy_triggered_by uuid;