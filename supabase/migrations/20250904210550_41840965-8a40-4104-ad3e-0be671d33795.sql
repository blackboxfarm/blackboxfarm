-- Remove the mock transaction system and fix the real HTTP calls
-- First, remove the existing cron job
SELECT cron.unschedule('process-blackbox-commands');

-- Clear the mock transactions
DELETE FROM blackbox_transactions WHERE signature LIKE 'mock_signature%';

-- Create the proper function that calls the real blackbox-executor
CREATE OR REPLACE FUNCTION process_active_blackbox_commands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    command_record RECORD;
    buy_interval INTEGER;
    sell_interval INTEGER;
    last_buy_time TIMESTAMP;
    last_sell_time TIMESTAMP;
    http_response RECORD;
    service_key TEXT;
BEGIN
    -- Get the service role key from Supabase settings
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU5MTMwNSwiZXhwIjoyMDcwMTY3MzA1fQ.B5_GVrQvCsGWjl5TjCfYBqd-F7wnJCJ6Hp2rrCqbdXo';
    
    -- Process each active command
    FOR command_record IN 
        SELECT bcc.id as command_id, bcc.config, bcc.wallet_id, bcc.name,
               bw.pubkey, bc.user_id, bc.nickname as campaign_name
        FROM blackbox_command_codes bcc
        JOIN blackbox_wallets bw ON bcc.wallet_id = bw.id
        JOIN blackbox_campaigns bc ON bw.campaign_id = bc.id
        WHERE bcc.is_active = true AND bc.is_active = true
    LOOP
        -- Extract intervals from config
        IF (command_record.config->>'type') = 'simple' THEN
            buy_interval := (command_record.config->>'buyInterval')::INTEGER;
            sell_interval := (command_record.config->>'sellInterval')::INTEGER;
        ELSE
            -- For complex type, use minimum intervals for more frequent execution
            buy_interval := (command_record.config->'buyInterval'->>'min')::INTEGER;
            sell_interval := (command_record.config->'sellInterval'->>'min')::INTEGER;
        END IF;
        
        -- Get last transaction times
        SELECT MAX(executed_at) INTO last_buy_time
        FROM blackbox_transactions 
        WHERE command_code_id = command_record.command_id 
        AND transaction_type = 'buy';
        
        SELECT MAX(executed_at) INTO last_sell_time
        FROM blackbox_transactions 
        WHERE command_code_id = command_record.command_id 
        AND transaction_type = 'sell';
        
        -- Check if it's time for a buy
        IF last_buy_time IS NULL OR last_buy_time < (now() - (buy_interval || ' seconds')::interval) THEN
            -- Execute real buy command via HTTP call
            BEGIN
                SELECT * INTO http_response FROM net.http_post(
                    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-executor',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || service_key,
                        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
                    ),
                    body := jsonb_build_object(
                        'command_code_id', command_record.command_id,
                        'action', 'buy'
                    )
                );
                
                -- Log the HTTP call result
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Real buy command executed for ' || command_record.name || ' - Status: ' || COALESCE(http_response.status_code::text, 'unknown'),
                    CASE WHEN http_response.status_code = 200 THEN 'info' ELSE 'error' END,
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'buy',
                        'wallet', command_record.pubkey,
                        'http_status', http_response.status_code,
                        'response', http_response.content
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to execute real buy command: ' || SQLERRM,
                    'error',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'buy',
                        'error', SQLERRM
                    )
                );
            END;
        END IF;
        
        -- Check if it's time for a sell
        IF last_sell_time IS NULL OR last_sell_time < (now() - (sell_interval || ' seconds')::interval) THEN
            -- Execute real sell command via HTTP call
            BEGIN
                SELECT * INTO http_response FROM net.http_post(
                    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-executor',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || service_key,
                        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
                    ),
                    body := jsonb_build_object(
                        'command_code_id', command_record.command_id,
                        'action', 'sell'
                    )
                );
                
                -- Log the HTTP call result
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Real sell command executed for ' || command_record.name || ' - Status: ' || COALESCE(http_response.status_code::text, 'unknown'),
                    CASE WHEN http_response.status_code = 200 THEN 'info' ELSE 'error' END,
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'sell',
                        'wallet', command_record.pubkey,
                        'http_status', http_response.status_code,
                        'response', http_response.content
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to execute real sell command: ' || SQLERRM,
                    'error',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'sell',
                        'error', SQLERRM
                    )
                );
            END;
        END IF;
    END LOOP;
END;
$$;

-- Schedule the function to run every 10 seconds for real trading
SELECT cron.schedule('real-blackbox-trading', '*/10 * * * * *', 'SELECT process_active_blackbox_commands();');