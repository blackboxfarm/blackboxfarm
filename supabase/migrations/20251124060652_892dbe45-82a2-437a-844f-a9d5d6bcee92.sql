-- Create arb_bot_status table to track bot state
CREATE TABLE IF NOT EXISTS public.arb_bot_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_running BOOLEAN NOT NULL DEFAULT false,
  last_scan_at TIMESTAMP WITH TIME ZONE,
  next_scan_at TIMESTAMP WITH TIME ZONE,
  scan_count_today INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('idle', 'scanning', 'executing', 'error', 'stopped')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.arb_bot_status ENABLE ROW LEVEL SECURITY;

-- Users can manage their own bot status
CREATE POLICY "Users can manage their own bot status"
  ON public.arb_bot_status
  FOR ALL
  USING (auth.uid() = user_id);

-- Create index for efficient lookups
CREATE INDEX idx_arb_bot_status_user_id ON public.arb_bot_status(user_id);
CREATE INDEX idx_arb_bot_status_is_running ON public.arb_bot_status(is_running);

-- Add trigger to update updated_at
CREATE TRIGGER update_arb_bot_status_updated_at
  BEFORE UPDATE ON public.arb_bot_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for arb_bot_status
ALTER PUBLICATION supabase_realtime ADD TABLE public.arb_bot_status;

-- Enable realtime for other arb tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.arb_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arb_loop_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arb_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arb_daily_stats;

-- Create function to schedule arb scanner
CREATE OR REPLACE FUNCTION public.schedule_arb_scanner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key TEXT;
  bot_record RECORD;
  http_response RECORD;
BEGIN
  service_key := current_setting('app.settings.service_role_key', true);
  
  -- Process each running bot
  FOR bot_record IN 
    SELECT bs.user_id, bc.polling_interval_sec
    FROM arb_bot_status bs
    JOIN arb_bot_config bc ON bc.user_id = bs.user_id
    WHERE bs.is_running = true
    AND (bs.next_scan_at IS NULL OR bs.next_scan_at <= now())
  LOOP
    -- Update status to scanning
    UPDATE arb_bot_status
    SET status = 'scanning',
        last_scan_at = now(),
        next_scan_at = now() + (bot_record.polling_interval_sec || ' seconds')::interval
    WHERE user_id = bot_record.user_id;
    
    -- Call the scanner function
    BEGIN
      SELECT * INTO http_response FROM net.http_post(
        url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/arb-opportunity-scanner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object('user_id', bot_record.user_id)
      );
      
      -- Update status back to idle
      UPDATE arb_bot_status
      SET status = 'idle',
          scan_count_today = scan_count_today + 1
      WHERE user_id = bot_record.user_id;
    EXCEPTION WHEN OTHERS THEN
      -- Update status to error
      UPDATE arb_bot_status
      SET status = 'error',
          error_message = SQLERRM
      WHERE user_id = bot_record.user_id;
    END;
  END LOOP;
END;
$$;

-- Create cron job to run every 10 seconds
SELECT cron.schedule(
  'arb-scanner-scheduler',
  '*/10 * * * * *',
  $$SELECT public.schedule_arb_scanner()$$
);