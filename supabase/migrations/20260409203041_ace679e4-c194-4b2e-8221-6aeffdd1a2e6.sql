
CREATE TABLE public.one_time_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_one_time_action_tokens_token ON public.one_time_action_tokens (token);
CREATE INDEX idx_one_time_action_tokens_user ON public.one_time_action_tokens (user_id);

ALTER TABLE public.one_time_action_tokens ENABLE ROW LEVEL SECURITY;

-- No client policies — only service_role accesses this table
