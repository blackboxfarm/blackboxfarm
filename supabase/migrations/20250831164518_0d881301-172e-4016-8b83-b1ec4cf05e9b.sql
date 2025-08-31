-- Fix function search path security warnings
CREATE OR REPLACE FUNCTION public.check_funding_goal_met()
RETURNS TRIGGER AS $$
BEGIN
  -- Update campaign status to 'funded' if goal is met
  IF NEW.current_funding_sol >= (SELECT funding_goal_sol FROM public.community_campaigns WHERE id = NEW.campaign_id) THEN
    UPDATE public.community_campaigns 
    SET status = 'funded', funded_at = now() 
    WHERE id = NEW.campaign_id AND status = 'funding';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;