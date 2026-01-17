-- Create telegram_monitor_run_logs table for per-run debugging stats
CREATE TABLE public.telegram_monitor_run_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  
  -- Channel info
  channel_config_id UUID REFERENCES public.telegram_channel_config(id) ON DELETE CASCADE,
  channel_id TEXT,
  channel_name TEXT,
  channel_username TEXT,
  
  -- Message stats
  fetched_count INTEGER NOT NULL DEFAULT 0,
  new_messages_count INTEGER NOT NULL DEFAULT 0,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  
  -- Token/call stats
  tokens_found_count INTEGER NOT NULL DEFAULT 0,
  calls_inserted_count INTEGER NOT NULL DEFAULT 0,
  interpretations_inserted_count INTEGER NOT NULL DEFAULT 0,
  fantasy_positions_inserted_count INTEGER NOT NULL DEFAULT 0,
  flipit_buys_count INTEGER NOT NULL DEFAULT 0,
  
  -- Message tracking
  previous_message_id INTEGER,
  new_max_message_id INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error', 'skipped')),
  error_message TEXT,
  skip_reasons JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  mtproto_used BOOLEAN DEFAULT false,
  lock_acquired BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_monitor_run_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (super admins only)
CREATE POLICY "Super admins can read monitor run logs"
  ON public.telegram_monitor_run_logs
  FOR SELECT
  USING (true);

-- Create policy for service role to insert
CREATE POLICY "Service role can insert monitor run logs"
  ON public.telegram_monitor_run_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update monitor run logs"
  ON public.telegram_monitor_run_logs
  FOR UPDATE
  USING (true);

-- Create indexes for common queries
CREATE INDEX idx_monitor_run_logs_channel ON public.telegram_monitor_run_logs(channel_config_id);
CREATE INDEX idx_monitor_run_logs_started ON public.telegram_monitor_run_logs(started_at DESC);
CREATE INDEX idx_monitor_run_logs_run_id ON public.telegram_monitor_run_logs(run_id);
CREATE INDEX idx_monitor_run_logs_status ON public.telegram_monitor_run_logs(status);

-- Auto-delete old logs (keep 7 days)
-- Comment: You may want to set up a cron job to delete old logs periodically