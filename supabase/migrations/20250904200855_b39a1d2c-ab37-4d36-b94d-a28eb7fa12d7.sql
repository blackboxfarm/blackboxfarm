-- Fix the check_notification_cooldown function to properly handle UUID casting
CREATE OR REPLACE FUNCTION public.check_notification_cooldown(p_campaign_id text, p_campaign_type text, p_hours integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;