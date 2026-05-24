
CREATE TABLE IF NOT EXISTS public.blackbox_parser_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NULL,
  token_mint text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'passive', -- 'manual_probe' | 'passive'
  bot_username text NULL,
  bot_user_id bigint NULL,
  bot_display_name text NULL,
  message_id bigint NOT NULL,
  raw_text text NOT NULL DEFAULT '',
  raw_entities_jsonb jsonb NULL,
  inline_buttons_jsonb jsonb NULL,
  has_photo boolean NOT NULL DEFAULT false,
  caption text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  parser_used text NULL,
  parser_attempt_jsonb jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_mint, message_id, bot_username)
);

CREATE INDEX IF NOT EXISTS idx_bb_parser_samples_bot ON public.blackbox_parser_samples (bot_username, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bb_parser_samples_mint ON public.blackbox_parser_samples (token_mint, received_at DESC);

ALTER TABLE public.blackbox_parser_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins can read parser samples"
ON public.blackbox_parser_samples FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "super admins can modify parser samples"
ON public.blackbox_parser_samples FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
