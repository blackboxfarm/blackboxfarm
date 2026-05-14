ALTER TABLE public.intel_briefings 
  ADD COLUMN IF NOT EXISTS social_image_url text,
  ADD COLUMN IF NOT EXISTS social_image_generated_at timestamptz;