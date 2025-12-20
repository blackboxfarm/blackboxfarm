-- Table for wallets being monitored for new mints
CREATE TABLE public.mint_monitor_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  label TEXT,
  source_token TEXT,
  is_cron_enabled BOOLEAN NOT NULL DEFAULT false,
  last_scanned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_address)
);

-- Table for detected mints
CREATE TABLE public.mint_monitor_detections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.mint_monitor_wallets(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  token_image TEXT,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(wallet_id, token_mint)
);

-- Enable RLS
ALTER TABLE public.mint_monitor_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_monitor_detections ENABLE ROW LEVEL SECURITY;

-- RLS policies for mint_monitor_wallets
CREATE POLICY "Users can view their own monitored wallets" 
ON public.mint_monitor_wallets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitored wallets" 
ON public.mint_monitor_wallets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitored wallets" 
ON public.mint_monitor_wallets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitored wallets" 
ON public.mint_monitor_wallets 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for mint_monitor_detections (via wallet ownership)
CREATE POLICY "Users can view their detected mints" 
ON public.mint_monitor_detections 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.mint_monitor_wallets w 
  WHERE w.id = wallet_id AND w.user_id = auth.uid()
));

CREATE POLICY "Users can delete their detected mints" 
ON public.mint_monitor_detections 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.mint_monitor_wallets w 
  WHERE w.id = wallet_id AND w.user_id = auth.uid()
));

-- Service role policy for edge functions to insert detections
CREATE POLICY "Service role can manage detections" 
ON public.mint_monitor_detections 
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for faster cron queries
CREATE INDEX idx_mint_monitor_wallets_cron 
ON public.mint_monitor_wallets(is_cron_enabled, last_scanned_at) 
WHERE is_cron_enabled = true;

-- Trigger to update updated_at
CREATE TRIGGER update_mint_monitor_wallets_updated_at
BEFORE UPDATE ON public.mint_monitor_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();