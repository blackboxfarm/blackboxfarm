-- Create holders page visitor tracking table
CREATE TABLE public.holders_page_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Session/visitor info
  session_id TEXT NOT NULL,
  visitor_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- User info (if logged in)
  user_id UUID REFERENCES auth.users(id),
  
  -- Source tracking
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  
  -- Page state
  token_preloaded TEXT,
  version_param TEXT,
  has_og_image BOOLEAN DEFAULT false,
  full_url TEXT,
  
  -- Visit metrics
  page_load_time_ms INTEGER,
  time_on_page_seconds INTEGER,
  reports_generated INTEGER DEFAULT 0,
  tokens_analyzed TEXT[] DEFAULT '{}',
  
  -- Device info
  device_type TEXT,
  browser TEXT,
  os TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  
  -- Geo (parsed from IP if available)
  country_code TEXT,
  
  -- Exit tracking
  exited_at TIMESTAMP WITH TIME ZONE,
  exit_type TEXT -- 'navigation', 'close', 'timeout'
);

-- Create indexes for efficient querying
CREATE INDEX idx_holders_visits_created_at ON public.holders_page_visits(created_at DESC);
CREATE INDEX idx_holders_visits_session_id ON public.holders_page_visits(session_id);
CREATE INDEX idx_holders_visits_referrer_domain ON public.holders_page_visits(referrer_domain);
CREATE INDEX idx_holders_visits_token_preloaded ON public.holders_page_visits(token_preloaded);
CREATE INDEX idx_holders_visits_ip_address ON public.holders_page_visits(ip_address);
CREATE INDEX idx_holders_visits_visitor_fingerprint ON public.holders_page_visits(visitor_fingerprint);

-- Enable RLS
ALTER TABLE public.holders_page_visits ENABLE ROW LEVEL SECURITY;

-- Super admins can read all visits
CREATE POLICY "Super admins can read all visits"
ON public.holders_page_visits
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Anyone can insert their own visit (tracked anonymously)
CREATE POLICY "Anyone can insert visits"
ON public.holders_page_visits
FOR INSERT
WITH CHECK (true);

-- Users can update their own session visits
CREATE POLICY "Users can update their own session visits"
ON public.holders_page_visits
FOR UPDATE
USING (session_id = current_setting('app.session_id', true) OR user_id = auth.uid());