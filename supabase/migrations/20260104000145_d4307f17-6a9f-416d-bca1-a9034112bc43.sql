-- Create table for logging token account cleanup operations
CREATE TABLE public.token_account_cleanup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_pubkey TEXT NOT NULL,
  wallet_source TEXT NOT NULL,
  accounts_closed INTEGER NOT NULL DEFAULT 0,
  sol_recovered NUMERIC(12, 6) NOT NULL DEFAULT 0,
  transaction_signatures TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for querying by wallet
CREATE INDEX idx_token_cleanup_wallet ON public.token_account_cleanup_logs(wallet_pubkey);

-- Create index for querying by date
CREATE INDEX idx_token_cleanup_created ON public.token_account_cleanup_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.token_account_cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" 
ON public.token_account_cleanup_logs
FOR ALL
USING (true)
WITH CHECK (true);