
-- Create intel_briefing_revisions table
CREATE TABLE public.intel_briefing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.intel_briefings(id) ON DELETE CASCADE,
  content_md text NOT NULL,
  title text NOT NULL,
  edited_by uuid,
  revision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.intel_briefing_revisions ENABLE ROW LEVEL SECURITY;

-- Super admins can read revisions
CREATE POLICY "Super admins can read revisions"
  ON public.intel_briefing_revisions
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Super admins can insert revisions
CREATE POLICY "Super admins can insert revisions"
  ON public.intel_briefing_revisions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Index for fast lookups by briefing
CREATE INDEX idx_intel_briefing_revisions_briefing ON public.intel_briefing_revisions (briefing_id, created_at DESC);

-- Create intel-images storage bucket (public read)
INSERT INTO storage.buckets (id, name, public) VALUES ('intel-images', 'intel-images', true);

-- Storage policies: anyone can read
CREATE POLICY "Public read intel images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'intel-images');

-- Super admins can upload
CREATE POLICY "Super admins can upload intel images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'intel-images' AND public.is_super_admin(auth.uid()));

-- Super admins can delete
CREATE POLICY "Super admins can delete intel images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'intel-images' AND public.is_super_admin(auth.uid()));
