
CREATE TABLE public.follower_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  handle TEXT NOT NULL,
  follower_count INTEGER,
  sample_size INTEGER NOT NULL DEFAULT 500,
  real_pct NUMERIC(5,2) DEFAULT 0,
  suspicious_pct NUMERIC(5,2) DEFAULT 0,
  bot_pct NUMERIC(5,2) DEFAULT 0,
  geo_breakdown JSONB DEFAULT '{}',
  signals_summary JSONB DEFAULT '{}',
  raw_sample JSONB DEFAULT '[]',
  cost_credits NUMERIC(6,2) DEFAULT 0,
  verdict TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.follower_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view follower audits"
ON public.follower_audits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert follower audits"
ON public.follower_audits FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_follower_audits_handle ON public.follower_audits (handle, created_at DESC);
