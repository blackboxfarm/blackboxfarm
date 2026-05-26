
CREATE TABLE public.no_lube_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  ticker text,
  verdict_class text NOT NULL,
  posted boolean NOT NULL DEFAULT false,
  block_reason text,
  mcap numeric,
  vol_24h numeric,
  liq_usd numeric,
  price_change_24h numeric,
  top10_pct numeric,
  age_minutes integer,
  mint_time timestamptz,
  composed_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  tg_message_id bigint,
  composed_by uuid
);

CREATE INDEX idx_no_lube_post_log_composed_at ON public.no_lube_post_log (composed_at DESC);
CREATE INDEX idx_no_lube_post_log_token_mint ON public.no_lube_post_log (token_mint);

GRANT SELECT ON public.no_lube_post_log TO authenticated;
GRANT ALL ON public.no_lube_post_log TO service_role;

ALTER TABLE public.no_lube_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins can view post log"
ON public.no_lube_post_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
