
CREATE TABLE public.intel_publications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_id UUID NOT NULL REFERENCES public.intel_briefings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content_depth INTEGER NOT NULL DEFAULT 100,
  published_url TEXT,
  notes TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intel_publications_briefing ON public.intel_publications(briefing_id);
CREATE INDEX idx_intel_publications_platform ON public.intel_publications(platform);
CREATE INDEX idx_intel_publications_published_at ON public.intel_publications(published_at);

ALTER TABLE public.intel_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view publications"
  ON public.intel_publications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert publications"
  ON public.intel_publications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update publications"
  ON public.intel_publications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete publications"
  ON public.intel_publications FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
