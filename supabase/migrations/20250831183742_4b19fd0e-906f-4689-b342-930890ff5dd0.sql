-- Add blackbox_campaign_id to community_campaigns table to link community campaigns to trading campaigns
ALTER TABLE public.community_campaigns ADD COLUMN blackbox_campaign_id UUID REFERENCES public.blackbox_campaigns(id);

-- Add index for performance
CREATE INDEX idx_community_campaigns_blackbox_campaign_id ON public.community_campaigns(blackbox_campaign_id);

-- Create trigger to automatically create blackbox campaign when community campaign is funded
CREATE OR REPLACE FUNCTION public.create_blackbox_campaign_for_funded_community()
RETURNS TRIGGER AS $$
DECLARE
    new_blackbox_campaign_id UUID;
BEGIN
    -- Only proceed if status changed to 'funded' and no blackbox campaign exists yet
    IF NEW.status = 'funded' AND OLD.status != 'funded' AND NEW.blackbox_campaign_id IS NULL THEN
        -- Create a new blackbox campaign
        INSERT INTO public.blackbox_campaigns (
            user_id,
            nickname,
            token_address,
            is_active
        ) VALUES (
            NEW.creator_id,
            NEW.title || ' (Community Funded)',
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
            'Community Campaign Funded! 🎉',
            'Your community campaign "' || NEW.title || '" has been fully funded and a trading campaign has been created. You can now configure and start trading.',
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
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_create_blackbox_campaign_for_funded_community
    AFTER UPDATE ON public.community_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.create_blackbox_campaign_for_funded_community();