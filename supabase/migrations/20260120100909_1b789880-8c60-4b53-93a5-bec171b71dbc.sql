-- Create table to store FlipIt Telegram notification settings
CREATE TABLE public.flipit_notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  notify_on_buy BOOLEAN NOT NULL DEFAULT true,
  notify_on_sell BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Junction table for selected notification targets
CREATE TABLE public.flipit_notification_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settings_id UUID REFERENCES public.flipit_notification_settings(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES public.telegram_message_targets(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(settings_id, target_id)
);

-- Enable RLS
ALTER TABLE public.flipit_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flipit_notification_targets ENABLE ROW LEVEL SECURITY;

-- Policies for settings
CREATE POLICY "Users can manage their own notification settings"
ON public.flipit_notification_settings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for targets (through settings ownership)
CREATE POLICY "Users can manage their own notification targets"
ON public.flipit_notification_targets
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.flipit_notification_settings s 
    WHERE s.id = settings_id AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.flipit_notification_settings s 
    WHERE s.id = settings_id AND s.user_id = auth.uid()
  )
);

-- Service role can insert for edge functions
CREATE POLICY "Service role can manage all notification settings"
ON public.flipit_notification_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage all notification targets"
ON public.flipit_notification_targets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);