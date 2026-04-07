-- Add chat_type column to distinguish DMs from group messages
ALTER TABLE public.telegram_group_messages 
ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'group';

-- Add flag to identify bot replies vs user messages
ALTER TABLE public.telegram_group_messages 
ADD COLUMN IF NOT EXISTS is_bot_reply boolean NOT NULL DEFAULT false;

-- Index for efficient DM queries by chat_id + chat_type
CREATE INDEX IF NOT EXISTS idx_tgm_chat_type ON public.telegram_group_messages (chat_type, chat_id);

-- Index for looking up DM conversations by telegram_user_id
CREATE INDEX IF NOT EXISTS idx_tgm_user_chat_type ON public.telegram_group_messages (telegram_user_id, chat_type);