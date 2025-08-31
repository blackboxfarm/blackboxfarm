-- Fix security warning: Add search_path to the function (drop trigger first)
DROP TRIGGER IF EXISTS trigger_create_blackbox_campaign_on_first_contribution ON public.community_campaigns;
DROP FUNCTION IF EXISTS public.create_blackbox_campaign_on_first_contribution();

CREATE OR REPLACE FUNCTION public.create_blackbox_campaign_on_first_contribution()
RETURNS TRIGGER AS $$
DECLARE
    new_blackbox_campaign_id UUID;
BEGIN
    -- Create blackbox campaign when current_funding_sol > 0 and no blackbox campaign exists yet
    IF NEW.current_funding_sol > 0 AND OLD.current_funding_sol = 0 AND NEW.blackbox_campaign_id IS NULL THEN
        -- Create a new blackbox campaign
        INSERT INTO public.blackbox_campaigns (
            user_id,
            nickname,
            token_address,
            is_active
        ) VALUES (
            NEW.creator_id,
            NEW.title || ' (Community)',
            NEW.token_address,
            true
        ) RETURNING id INTO new_blackbox_campaign_id;
        
        -- Link the community campaign to the blackbox campaign
        UPDATE public.community_campaigns 
        SET blackbox_campaign_id = new_blackbox_campaign_id
        WHERE id = NEW.id;
        
        -- Create notification for the campaign creator
        INSERT INTO public.notifications (user_id, title, message, type, metadata)
        VALUES (
            NEW.creator_id,
            'Trading Campaign Created! 🚀',
            'Your community campaign "' || NEW.title || '" has received funding and a trading campaign has been created. You can now configure and start trading.',
            'success',
            jsonb_build_object(
                'community_campaign_id', NEW.id,
                'blackbox_campaign_id', new_blackbox_campaign_id,
                'funding_amount', NEW.current_funding_sol
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Recreate the trigger
CREATE TRIGGER trigger_create_blackbox_campaign_on_first_contribution
    AFTER UPDATE ON public.community_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.create_blackbox_campaign_on_first_contribution();