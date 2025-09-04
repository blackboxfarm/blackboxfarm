-- Fix the track_campaign_state_change function to properly handle UUID types
CREATE OR REPLACE FUNCTION public.track_campaign_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    
    -- Get or create timing record using proper UUID comparison
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
$function$;