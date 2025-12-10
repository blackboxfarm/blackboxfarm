-- Create table to track FUCT gift claims for rate limiting
CREATE TABLE public.fuct_gift_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_wallet TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint for rate limiting (one claim per fingerprint per day)
CREATE UNIQUE INDEX idx_fuct_claims_fingerprint_daily 
ON public.fuct_gift_claims (device_fingerprint, claim_date);

-- Create index for IP-based lookups
CREATE INDEX idx_fuct_claims_ip_daily 
ON public.fuct_gift_claims (ip_address, claim_date);

-- Enable RLS
ALTER TABLE public.fuct_gift_claims ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (the edge function handles validation)
CREATE POLICY "Allow public inserts for gift claims"
ON public.fuct_gift_claims
FOR INSERT
TO public
WITH CHECK (true);

-- Allow public reads
CREATE POLICY "Allow public reads"
ON public.fuct_gift_claims
FOR SELECT
TO public
USING (true);