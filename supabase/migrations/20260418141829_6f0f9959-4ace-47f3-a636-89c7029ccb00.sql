-- Table 1: Channel comparison pairs (VIP vs Public)
CREATE TABLE public.channel_comparison_pairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair_name TEXT NOT NULL,
  vip_channel_id TEXT NOT NULL,
  vip_channel_name TEXT,
  public_channel_id TEXT NOT NULL,
  public_channel_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vip_channel_id, public_channel_id)
);

CREATE INDEX idx_channel_comparison_pairs_active ON public.channel_comparison_pairs (is_active) WHERE is_active = true;

-- Table 2: Hourly comparison run snapshots
CREATE TABLE public.channel_pair_comparison_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair_id UUID NOT NULL REFERENCES public.channel_comparison_pairs(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  vip_call_count INT NOT NULL DEFAULT 0,
  public_call_count INT NOT NULL DEFAULT 0,
  overlap_tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
  vip_lead_overlap JSONB NOT NULL DEFAULT '[]'::jsonb,
  vip_exclusives JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_exclusives JSONB NOT NULL DEFAULT '[]'::jsonb,
  vip_avg_mcap_at_call NUMERIC,
  public_avg_mcap_at_call NUMERIC,
  vip_avg_lead_seconds NUMERIC,
  vip_pnl_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_pnl_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_summary TEXT,
  ai_verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pair_runs_pair_id_window ON public.channel_pair_comparison_runs (pair_id, window_start DESC);
CREATE INDEX idx_pair_runs_created_at ON public.channel_pair_comparison_runs (created_at DESC);

-- Enable RLS
ALTER TABLE public.channel_comparison_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_pair_comparison_runs ENABLE ROW LEVEL SECURITY;

-- Super-admin only policies (mirror admin-data-visibility-policies pattern)
CREATE POLICY "Super admins can view comparison pairs"
ON public.channel_comparison_pairs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage comparison pairs"
ON public.channel_comparison_pairs FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view comparison runs"
ON public.channel_pair_comparison_runs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage comparison runs"
ON public.channel_pair_comparison_runs FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Service role can write (edge functions)
CREATE POLICY "Service role can insert comparison runs"
ON public.channel_pair_comparison_runs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger
CREATE TRIGGER update_channel_comparison_pairs_updated_at
BEFORE UPDATE ON public.channel_comparison_pairs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();