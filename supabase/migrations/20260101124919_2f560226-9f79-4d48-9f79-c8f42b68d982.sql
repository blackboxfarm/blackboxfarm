-- Create poll runs table to track each poll execution
CREATE TABLE IF NOT EXISTS public.pumpfun_poll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  results jsonb,
  error_message text,
  tokens_scanned integer DEFAULT 0,
  candidates_added integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add poll_run_id column to discovery logs for grouping
ALTER TABLE public.pumpfun_discovery_logs 
ADD COLUMN IF NOT EXISTS poll_run_id uuid REFERENCES public.pumpfun_poll_runs(id);

-- Create index for efficient filtering by poll run
CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_poll_run_id 
ON public.pumpfun_discovery_logs(poll_run_id);

-- Enable RLS on poll_runs table
ALTER TABLE public.pumpfun_poll_runs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read poll runs (super admin tool)
CREATE POLICY "Allow read access to poll runs" 
ON public.pumpfun_poll_runs 
FOR SELECT 
USING (true);

-- Allow inserts from service role (edge functions)
CREATE POLICY "Allow insert for service role" 
ON public.pumpfun_poll_runs 
FOR INSERT 
WITH CHECK (true);

-- Allow updates for service role
CREATE POLICY "Allow update for service role" 
ON public.pumpfun_poll_runs 
FOR UPDATE 
USING (true);