-- Add manual review columns for learning/backtesting to pumpfun_discovery_logs
ALTER TABLE public.pumpfun_discovery_logs 
ADD COLUMN IF NOT EXISTS should_have_bought boolean DEFAULT NULL,
ADD COLUMN IF NOT EXISTS manual_review_notes text,
ADD COLUMN IF NOT EXISTS manual_review_at timestamptz,
ADD COLUMN IF NOT EXISTS actual_outcome text CHECK (actual_outcome IN ('pumped', 'dumped', 'sideways', 'unknown')),
ADD COLUMN IF NOT EXISTS actual_roi_pct numeric,
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

-- Add index for filtering by manual reviews
CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_should_have_bought 
ON public.pumpfun_discovery_logs(should_have_bought) 
WHERE should_have_bought IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_reviewed 
ON public.pumpfun_discovery_logs(manual_review_at) 
WHERE manual_review_at IS NOT NULL;

-- Allow authenticated users to update manual review columns
CREATE POLICY "Authenticated users can update manual review fields" 
ON public.pumpfun_discovery_logs 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);