-- Add unique constraint on chat_id for channel_installations to support upsert
ALTER TABLE public.channel_installations ADD CONSTRAINT channel_installations_chat_id_unique UNIQUE (chat_id);