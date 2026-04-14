
CREATE TABLE public.intel_briefing_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_id UUID NOT NULL REFERENCES public.intel_briefings(id) ON DELETE CASCADE,
  depth INTEGER NOT NULL CHECK (depth IN (75, 50, 25)),
  content_md TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (briefing_id, depth)
);

ALTER TABLE public.intel_briefing_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view variants"
  ON public.intel_briefing_variants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert variants"
  ON public.intel_briefing_variants FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update variants"
  ON public.intel_briefing_variants FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete variants"
  ON public.intel_briefing_variants FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER update_intel_briefing_variants_updated_at
  BEFORE UPDATE ON public.intel_briefing_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
