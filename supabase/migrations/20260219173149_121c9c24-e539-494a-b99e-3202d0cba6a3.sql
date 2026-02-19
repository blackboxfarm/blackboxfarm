
CREATE TABLE public.bundle_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_number SERIAL,
  wallet_count INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'CLEAN',
  risk_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bundle_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage bundle reports"
ON public.bundle_reports
FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_bundle_reports_created_at ON public.bundle_reports (created_at DESC);
