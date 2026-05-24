ALTER TABLE public.blackbox_channel_config
  ADD CONSTRAINT blackbox_channel_config_role_key UNIQUE (role);

INSERT INTO public.blackbox_channel_config (role, chat_id, label, enabled)
VALUES
  ('insiders_source', '-1003694579312', 'Insiders', true),
  ('blackbox_group',  '-1003739469076', 'BLACKBOX',  true),
  ('output_channel',  '-1003973881943', 'BlackBox Output', true)
ON CONFLICT (role) DO UPDATE
  SET chat_id = EXCLUDED.chat_id,
      label   = EXCLUDED.label,
      enabled = true,
      updated_at = now();