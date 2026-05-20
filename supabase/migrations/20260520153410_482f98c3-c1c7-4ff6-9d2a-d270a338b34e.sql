
CREATE TABLE IF NOT EXISTS public.token_cto_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL UNIQUE,
  is_cto BOOLEAN NOT NULL DEFAULT false,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  admin_override BOOLEAN NOT NULL DEFAULT false,
  set_by UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_cto_status_mint ON public.token_cto_status(token_mint);

ALTER TABLE public.token_cto_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cto_status_public_read" ON public.token_cto_status FOR SELECT USING (true);
CREATE POLICY "cto_status_admin_insert" ON public.token_cto_status FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "cto_status_admin_update" ON public.token_cto_status FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "cto_status_admin_delete" ON public.token_cto_status FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_token_cto_status_updated
BEFORE UPDATE ON public.token_cto_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.token_narrative_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  source_domain TEXT,
  editor_note TEXT,
  added_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_narrative_links_mint ON public.token_narrative_links(token_mint) WHERE is_active = true;

ALTER TABLE public.token_narrative_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrative_links_public_read" ON public.token_narrative_links FOR SELECT USING (is_active = true);
CREATE POLICY "narrative_links_admin_insert" ON public.token_narrative_links FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "narrative_links_admin_update" ON public.token_narrative_links FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "narrative_links_admin_delete" ON public.token_narrative_links FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_token_narrative_links_updated
BEFORE UPDATE ON public.token_narrative_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.token_optimistic_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL UNIQUE,
  summary JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS idx_optimistic_summary_mint ON public.token_optimistic_summary_cache(token_mint);

ALTER TABLE public.token_optimistic_summary_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "optimistic_cache_public_read" ON public.token_optimistic_summary_cache FOR SELECT USING (true);
CREATE POLICY "optimistic_cache_service_write" ON public.token_optimistic_summary_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
