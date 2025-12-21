-- Create table to log every cron scan attempt per wallet
CREATE TABLE IF NOT EXISTS public.mint_monitor_scan_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID REFERENCES public.mint_monitor_wallets(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  mints_found INTEGER NOT NULL DEFAULT 0,
  new_mints_detected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  scan_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mint_monitor_scan_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for their own wallets
CREATE POLICY "Users can view their own wallet scan logs"
ON public.mint_monitor_scan_logs
FOR SELECT
USING (
  wallet_id IN (
    SELECT id FROM public.mint_monitor_wallets WHERE user_id = auth.uid()
  )
);

-- Policy: Allow service role to insert logs
CREATE POLICY "Service role can insert scan logs"
ON public.mint_monitor_scan_logs
FOR INSERT
WITH CHECK (true);

-- Policy: Users can delete logs for their own wallets
CREATE POLICY "Users can delete their own wallet scan logs"
ON public.mint_monitor_scan_logs
FOR DELETE
USING (
  wallet_id IN (
    SELECT id FROM public.mint_monitor_wallets WHERE user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_mint_monitor_scan_logs_wallet_id ON public.mint_monitor_scan_logs(wallet_id);
CREATE INDEX idx_mint_monitor_scan_logs_scanned_at ON public.mint_monitor_scan_logs(scanned_at DESC);