-- Create table for saved Telegram message targets
CREATE TABLE public.telegram_message_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  label TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('public', 'private')),
  chat_username TEXT, -- For public groups
  chat_id TEXT, -- For private groups (numeric ID as string)
  resolved_name TEXT, -- Name fetched from Telegram API
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_message_targets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own targets"
ON public.telegram_message_targets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own targets"
ON public.telegram_message_targets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own targets"
ON public.telegram_message_targets
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own targets"
ON public.telegram_message_targets
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_telegram_message_targets_updated_at
BEFORE UPDATE ON public.telegram_message_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();