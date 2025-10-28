-- Create developer_alerts table for tracking high-risk token alerts
CREATE TABLE IF NOT EXISTS public.developer_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  creator_wallet TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  developer_id UUID REFERENCES public.developer_profiles(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.developer_alerts ENABLE ROW LEVEL SECURITY;

-- Super admins can view all alerts
CREATE POLICY "Super admins can view all alerts"
  ON public.developer_alerts
  FOR SELECT
  USING (is_super_admin(auth.uid()));

-- Super admins can insert alerts (also via edge functions)
CREATE POLICY "Super admins can insert alerts"
  ON public.developer_alerts
  FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR auth.jwt()->>'role' = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_developer_alerts_token_mint ON public.developer_alerts(token_mint);
CREATE INDEX idx_developer_alerts_creator_wallet ON public.developer_alerts(creator_wallet);
CREATE INDEX idx_developer_alerts_developer_id ON public.developer_alerts(developer_id);
CREATE INDEX idx_developer_alerts_risk_level ON public.developer_alerts(risk_level);
CREATE INDEX idx_developer_alerts_created_at ON public.developer_alerts(created_at DESC);

-- Add RPC function to get super admin user IDs
CREATE OR REPLACE FUNCTION get_super_admin_ids()
RETURNS TABLE(user_id UUID) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_id
  FROM user_roles ur
  WHERE ur.role = 'super_admin' 
    AND ur.is_active = true;
END;
$$;