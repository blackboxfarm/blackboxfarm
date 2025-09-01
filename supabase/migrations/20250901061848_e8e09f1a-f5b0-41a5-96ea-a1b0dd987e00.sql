-- Create campaign_notifications table to track manual notifications and timing
CREATE TABLE public.campaign_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('blackbox', 'community')),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('manual_start', 'manual_restart', 'auto_pause', 'auto_end')),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign_timing table to track campaign durations and states
CREATE TABLE public.campaign_timing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('blackbox', 'community')),
  started_at TIMESTAMP WITH TIME ZONE,
  paused_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  total_runtime_minutes INTEGER DEFAULT 0,
  planned_duration_minutes INTEGER,
  state_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_timing ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_notifications
CREATE POLICY "Users can view notifications for their campaigns"
ON public.campaign_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.blackbox_campaigns bc
    WHERE bc.id = campaign_notifications.campaign_id::uuid 
    AND bc.user_id = auth.uid()
    AND campaign_notifications.campaign_type = 'blackbox'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.community_campaigns cc
    WHERE cc.id = campaign_notifications.campaign_id::uuid 
    AND cc.creator_id = auth.uid()
    AND campaign_notifications.campaign_type = 'community'
  )
);

CREATE POLICY "Users can create notifications for their campaigns"
ON public.campaign_notifications
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.blackbox_campaigns bc
    WHERE bc.id = campaign_notifications.campaign_id::uuid 
    AND bc.user_id = auth.uid()
    AND campaign_notifications.campaign_type = 'blackbox'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.community_campaigns cc
    WHERE cc.id = campaign_notifications.campaign_id::uuid 
    AND cc.creator_id = auth.uid()
    AND campaign_notifications.campaign_type = 'community'
  )
);

-- RLS policies for campaign_timing
CREATE POLICY "Users can manage timing for their campaigns"
ON public.campaign_timing
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.blackbox_campaigns bc
    WHERE bc.id = campaign_timing.campaign_id::uuid 
    AND bc.user_id = auth.uid()
    AND campaign_timing.campaign_type = 'blackbox'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.community_campaigns cc
    WHERE cc.id = campaign_timing.campaign_id::uuid 
    AND cc.creator_id = auth.uid()
    AND campaign_timing.campaign_type = 'community'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.blackbox_campaigns bc
    WHERE bc.id = campaign_timing.campaign_id::uuid 
    AND bc.user_id = auth.uid()
    AND campaign_timing.campaign_type = 'blackbox'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.community_campaigns cc
    WHERE cc.id = campaign_timing.campaign_id::uuid 
    AND cc.creator_id = auth.uid()
    AND campaign_timing.campaign_type = 'community'
  )
);

-- Add updated_at trigger for campaign_timing
CREATE TRIGGER update_campaign_timing_updated_at
BEFORE UPDATE ON public.campaign_timing
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to track campaign state changes
CREATE OR REPLACE FUNCTION public.track_campaign_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    timing_record public.campaign_timing;
    state_change JSONB;
    runtime_minutes INTEGER;
BEGIN
    -- Determine if this is blackbox or community campaign
    state_change := jsonb_build_object(
        'timestamp', now(),
        'from_active', COALESCE(OLD.is_active, false),
        'to_active', NEW.is_active,
        'trigger', 'manual'
    );
    
    -- Get or create timing record
    SELECT * INTO timing_record
    FROM public.campaign_timing
    WHERE campaign_id = NEW.id::text
    AND campaign_type = TG_ARGV[0];
    
    IF timing_record IS NULL THEN
        -- Create new timing record
        INSERT INTO public.campaign_timing (
            campaign_id,
            campaign_type,
            started_at,
            state_changes
        ) VALUES (
            NEW.id::text,
            TG_ARGV[0],
            CASE WHEN NEW.is_active THEN now() ELSE NULL END,
            jsonb_build_array(state_change)
        );
    ELSE
        -- Update existing timing record
        IF NEW.is_active AND NOT COALESCE(OLD.is_active, false) THEN
            -- Campaign started/restarted
            timing_record.started_at := now();
            timing_record.paused_at := NULL;
        ELSIF NOT NEW.is_active AND COALESCE(OLD.is_active, false) THEN
            -- Campaign paused
            timing_record.paused_at := now();
            
            -- Calculate runtime if we have a start time
            IF timing_record.started_at IS NOT NULL THEN
                runtime_minutes := EXTRACT(epoch FROM (now() - timing_record.started_at)) / 60;
                timing_record.total_runtime_minutes := timing_record.total_runtime_minutes + runtime_minutes;
            END IF;
        END IF;
        
        -- Append state change to history
        timing_record.state_changes := timing_record.state_changes || jsonb_build_array(state_change);
        
        -- Update the record
        UPDATE public.campaign_timing
        SET 
            started_at = timing_record.started_at,
            paused_at = timing_record.paused_at,
            total_runtime_minutes = timing_record.total_runtime_minutes,
            state_changes = timing_record.state_changes,
            updated_at = now()
        WHERE id = timing_record.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create triggers for campaign state tracking
CREATE TRIGGER track_blackbox_campaign_state
AFTER UPDATE ON public.blackbox_campaigns
FOR EACH ROW
WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
EXECUTE FUNCTION public.track_campaign_state_change('blackbox');

-- Function to check notification cooldown
CREATE OR REPLACE FUNCTION public.check_notification_cooldown(
    p_campaign_id TEXT,
    p_campaign_type TEXT,
    p_hours INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    last_notification TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT MAX(sent_at) INTO last_notification
    FROM public.campaign_notifications
    WHERE campaign_id = p_campaign_id::uuid
    AND campaign_type = p_campaign_type
    AND notification_type IN ('manual_start', 'manual_restart');
    
    -- If no previous notification or cooldown period has passed
    RETURN (last_notification IS NULL OR last_notification < (now() - (p_hours || ' hours')::interval));
END;
$$;