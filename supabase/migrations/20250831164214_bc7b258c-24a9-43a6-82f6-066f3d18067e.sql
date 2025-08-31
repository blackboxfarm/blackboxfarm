-- Create community campaigns table
CREATE TABLE public.community_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  token_address TEXT NOT NULL,
  funding_goal_sol NUMERIC NOT NULL,
  current_funding_sol NUMERIC NOT NULL DEFAULT 0,
  target_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  campaign_parameters JSONB NOT NULL DEFAULT '{}',
  multisig_wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'funding',
  min_contribution_sol NUMERIC NOT NULL DEFAULT 0.01,
  max_contribution_sol NUMERIC,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  funded_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE
);

-- Create community contributions table
CREATE TABLE public.community_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.community_campaigns(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL,
  amount_sol NUMERIC NOT NULL,
  transaction_signature TEXT,
  contribution_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  refunded BOOLEAN NOT NULL DEFAULT false,
  refund_signature TEXT,
  refunded_at TIMESTAMP WITH TIME ZONE
);

-- Create community campaign executions table
CREATE TABLE public.community_campaign_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.community_campaigns(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  command_config JSONB NOT NULL,
  execution_status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  revenue_generated_sol NUMERIC DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  error_message TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.community_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_campaign_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for community_campaigns
CREATE POLICY "Anyone can view active community campaigns" 
ON public.community_campaigns 
FOR SELECT 
USING (status IN ('funding', 'funded', 'executing', 'completed'));

CREATE POLICY "Users can create community campaigns" 
ON public.community_campaigns 
FOR INSERT 
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Campaign creators can update their campaigns" 
ON public.community_campaigns 
FOR UPDATE 
USING (auth.uid() = creator_id);

-- RLS Policies for community_contributions
CREATE POLICY "Users can view contributions to campaigns they participated in" 
ON public.community_contributions 
FOR SELECT 
USING (auth.uid() = contributor_id OR EXISTS (
  SELECT 1 FROM public.community_campaigns cc 
  WHERE cc.id = campaign_id AND cc.creator_id = auth.uid()
));

CREATE POLICY "Users can create contributions" 
ON public.community_contributions 
FOR INSERT 
WITH CHECK (auth.uid() = contributor_id);

-- RLS Policies for community_campaign_executions
CREATE POLICY "Users can view executions for their campaigns or contributions" 
ON public.community_campaign_executions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.community_campaigns cc 
  WHERE cc.id = campaign_id AND (
    cc.creator_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.community_contributions con WHERE con.campaign_id = cc.id AND con.contributor_id = auth.uid())
  )
));

-- Create indexes for better performance
CREATE INDEX idx_community_campaigns_status ON public.community_campaigns(status);
CREATE INDEX idx_community_campaigns_creator ON public.community_campaigns(creator_id);
CREATE INDEX idx_community_campaigns_deadline ON public.community_campaigns(target_deadline);
CREATE INDEX idx_community_contributions_campaign ON public.community_contributions(campaign_id);
CREATE INDEX idx_community_contributions_contributor ON public.community_contributions(contributor_id);
CREATE INDEX idx_community_campaign_executions_campaign ON public.community_campaign_executions(campaign_id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_community_campaigns_updated_at
BEFORE UPDATE ON public.community_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check if campaign funding goal is met
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to check funding goal when contributions are made
CREATE TRIGGER check_funding_goal_trigger
AFTER INSERT ON public.community_contributions
FOR EACH ROW
EXECUTE FUNCTION public.check_funding_goal_met();