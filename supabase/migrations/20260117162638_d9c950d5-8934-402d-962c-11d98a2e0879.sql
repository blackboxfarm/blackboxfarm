-- Create telegram_announcement_targets table for per-channel announcement configurations
CREATE TABLE public.telegram_announcement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_channel_id UUID NOT NULL REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE,
  target_channel_id TEXT NOT NULL,
  target_channel_name TEXT,
  custom_message TEXT DEFAULT 'Aped a bit of this - DYOR - I''m just guessing',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id)
);

-- Add master toggle column to telegram_channel_config
ALTER TABLE public.telegram_channel_config 
ADD COLUMN telegram_announcements_enabled BOOLEAN DEFAULT false;

-- Remove the old single-channel field (it was just added)
ALTER TABLE public.telegram_channel_config 
DROP COLUMN IF EXISTS announce_to_channel_id;

-- Enable RLS
ALTER TABLE public.telegram_announcement_targets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own announcement targets"
ON public.telegram_announcement_targets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own announcement targets"
ON public.telegram_announcement_targets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own announcement targets"
ON public.telegram_announcement_targets
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own announcement targets"
ON public.telegram_announcement_targets
FOR DELETE
USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX idx_telegram_announcement_targets_source 
ON public.telegram_announcement_targets(source_channel_id, is_active);