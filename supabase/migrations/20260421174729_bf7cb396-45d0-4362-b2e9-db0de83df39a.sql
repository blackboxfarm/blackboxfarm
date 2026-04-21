CREATE TABLE public.telegram_insider_token_lifecycle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint TEXT NOT NULL UNIQUE,
  token_symbol TEXT,
  channel_name TEXT NOT NULL DEFAULT 'insiders',
  first_called_at TIMESTAMPTZ NOT NULL,
  first_call_message_id BIGINT,
  entry_market_cap NUMERIC,
  entry_mc_text TEXT,
  peak_multiplier NUMERIC NOT NULL DEFAULT 1,
  peak_market_cap NUMERIC,
  peak_reached_at TIMESTAMPTZ,
  milestone_count INTEGER NOT NULL DEFAULT 0,
  milestone_timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_milestone_at TIMESTAMPTZ,
  lifespan_minutes INTEGER,
  total_messages INTEGER NOT NULL DEFAULT 1,
  creator_wallet TEXT,
  creator_resolved_at TIMESTAMPTZ,
  creator_risk_tier TEXT,
  is_rugged BOOLEAN NOT NULL DEFAULT false,
  rug_evidence JSONB,
  mesh_promotion_status TEXT NOT NULL DEFAULT 'not_eligible',
  mesh_promoted_at TIMESTAMPTZ,
  mesh_promotion_reason TEXT,
  raw_alert_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insider_lifecycle_peak_mult ON public.telegram_insider_token_lifecycle (peak_multiplier DESC);
CREATE INDEX idx_insider_lifecycle_first_called ON public.telegram_insider_token_lifecycle (first_called_at DESC);
CREATE INDEX idx_insider_lifecycle_mesh_status ON public.telegram_insider_token_lifecycle (mesh_promotion_status);
CREATE INDEX idx_insider_lifecycle_creator ON public.telegram_insider_token_lifecycle (creator_wallet) WHERE creator_wallet IS NOT NULL;

ALTER TABLE public.telegram_insider_token_lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view insider lifecycle"
ON public.telegram_insider_token_lifecycle
FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage insider lifecycle"
ON public.telegram_insider_token_lifecycle
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_insider_lifecycle_updated_at
BEFORE UPDATE ON public.telegram_insider_token_lifecycle
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();