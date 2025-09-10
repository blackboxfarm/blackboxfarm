-- Drop and recreate the track_campaign_state_change function with proper DELETE handling
DROP FUNCTION IF EXISTS public.track_campaign_state_change() CASCADE;

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
    campaign_id_val uuid;
BEGIN
    -- Handle different operation types
    IF TG_OP = 'DELETE' THEN
        campaign_id_val := OLD.id::uuid;
        -- For DELETE operations, just return OLD
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        campaign_id_val := NEW.id::uuid;
        -- For INSERT operations, just return NEW
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        campaign_id_val := NEW.id::uuid;
    ELSE
        -- Unknown operation, return safely
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Only track state changes for UPDATE operations
    IF TG_OP != 'UPDATE' THEN
        RETURN NEW;
    END IF;
    
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
    WHERE campaign_timing.campaign_id = campaign_id_val
    AND campaign_type = TG_ARGV[0];
    
    IF timing_record IS NULL THEN
        -- Create new timing record with UUID value
        INSERT INTO public.campaign_timing (
            campaign_id,
            campaign_type,
            started_at,
            state_changes
        ) VALUES (
            campaign_id_val,
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

-- Recreate the triggers for both blackbox and community campaigns
DROP TRIGGER IF EXISTS track_blackbox_campaign_state ON public.blackbox_campaigns;
DROP TRIGGER IF EXISTS track_community_campaign_state ON public.community_campaigns;

CREATE TRIGGER track_blackbox_campaign_state
    AFTER UPDATE ON public.blackbox_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.track_campaign_state_change('blackbox');

CREATE TRIGGER track_community_campaign_state
    AFTER UPDATE ON public.community_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.track_campaign_state_change('community');