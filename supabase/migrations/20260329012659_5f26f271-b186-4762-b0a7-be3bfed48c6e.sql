-- Style presets table for AI image generation references
CREATE TABLE public.image_style_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  style_type text NOT NULL DEFAULT 'preset' CHECK (style_type IN ('preset', 'custom')),
  style_prompt text NOT NULL,
  reference_image_urls text[] DEFAULT '{}',
  thumbnail_url text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.image_style_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read for style presets"
ON public.image_style_presets FOR SELECT TO public
USING (true);

CREATE POLICY "Service role manages style presets"
ON public.image_style_presets FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users manage style presets"
ON public.image_style_presets FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Storage bucket for style reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('style-references', 'style-references', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read style references"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'style-references');

CREATE POLICY "Authenticated upload style references"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'style-references');

CREATE POLICY "Authenticated delete style references"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'style-references');

-- Seed preset styles
INSERT INTO public.image_style_presets (name, description, style_type, style_prompt, is_default) VALUES
('Cyberpunk Intel', 'Dark cyberpunk with neon orange and cyan accents — the HoldersIntel signature look', 'preset',
 'Recreate the concept in a dark, cyberpunk-crypto style: deep blacks, neon orange (#FF6B00), electric cyan accents. Include subtle blockchain imagery (hex patterns, node networks). Professional data-driven aesthetic. HoldersIntel branding feel — premium crypto intelligence platform. No text overlay needed.', true),
('Clean Minimal', 'Modern minimalist with high contrast, clean lines, and subtle gradients', 'preset',
 'Recreate the concept in a clean, minimalist style: white/light gray background, sharp geometric shapes, subtle gradient accents in blue and purple. Modern tech aesthetic, high contrast, lots of breathing room. Professional and sleek. No text overlay needed.', false),
('Retro Terminal', 'Green-on-black terminal aesthetic with scan lines and monospace vibes', 'preset',
 'Recreate the concept in a retro terminal/hacker aesthetic: black background, phosphor green (#00FF41) primary color, scan lines, CRT glow effects. Monospace font feel, matrix-style data streams. Old-school hacker meets crypto. No text overlay needed.', false),
('Neon Gradient', 'Vibrant neon gradients with glass morphism and bold colors', 'preset',
 'Recreate the concept with vibrant neon gradients: hot pink to electric blue to purple gradient backgrounds. Glass morphism overlays, bold saturated colors, subtle blur effects. Modern Web3 aesthetic, trendy and eye-catching. No text overlay needed.', false),
('Dark Corporate', 'Professional dark navy with gold accents — premium finance feel', 'preset',
 'Recreate the concept in a premium corporate style: dark navy (#0A1628) background, gold (#D4AF37) accents, subtle grid patterns. Professional finance/Bloomberg terminal aesthetic. Clean data visualization feel, authoritative and trustworthy. No text overlay needed.', false);