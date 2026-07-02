ALTER TABLE public.blackbox_bot_replies
  ADD COLUMN IF NOT EXISTS entities_jsonb jsonb,
  ADD COLUMN IF NOT EXISTS link_urls text[],
  ADD COLUMN IF NOT EXISTS web_preview jsonb;