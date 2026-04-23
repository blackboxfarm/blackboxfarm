-- Super Admin Docs: internal explainer/whitepaper library
CREATE TABLE public.super_admin_docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  summary TEXT,
  content_md TEXT NOT NULL DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_super_admin_docs_category ON public.super_admin_docs(category);
CREATE INDEX idx_super_admin_docs_slug ON public.super_admin_docs(slug);

ALTER TABLE public.super_admin_docs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read/write
CREATE POLICY "Super admins can view docs"
ON public.super_admin_docs FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert docs"
ON public.super_admin_docs FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update docs"
ON public.super_admin_docs FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete docs"
ON public.super_admin_docs FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- updated_at trigger (reuse existing function)
CREATE TRIGGER update_super_admin_docs_updated_at
BEFORE UPDATE ON public.super_admin_docs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();