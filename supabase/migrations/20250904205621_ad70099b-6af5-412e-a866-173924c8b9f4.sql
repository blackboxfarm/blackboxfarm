-- Create a cron job to execute active blackbox commands every 10 seconds
-- First, we need to enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to process all active blackbox commands
CREATE OR REPLACE FUNCTION process_active_blackbox_commands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    command_record RECORD;
    should_execute BOOLEAN;
    buy_interval INTEGER;
    sell_interval INTEGER;
    last_buy_time TIMESTAMP;
    last_sell_time TIMESTAMP;
BEGIN
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
        should_execute := false;
        IF last_buy_time IS NULL OR last_buy_time < (now() - (buy_interval || ' seconds')::interval) THEN
            -- Execute buy command
            BEGIN
                PERFORM net.http_post(
                    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-executor',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
                    ),
                    body := jsonb_build_object(
                        'command_code_id', command_record.command_id,
                        'action', 'buy'
                    )
                );
                
                -- Log the execution attempt
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Executed buy command for ' || command_record.name || ' in campaign ' || command_record.campaign_name,
                    'info',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'buy',
                        'wallet', command_record.pubkey
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to execute buy command: ' || SQLERRM,
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
            -- Execute sell command
            BEGIN
                PERFORM net.http_post(
                    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-executor',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
                    ),
                    body := jsonb_build_object(
                        'command_code_id', command_record.command_id,
                        'action', 'sell'
                    )
                );
                
                -- Log the execution attempt
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Executed sell command for ' || command_record.name || ' in campaign ' || command_record.campaign_name,
                    'info',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'sell',
                        'wallet', command_record.pubkey
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to execute sell command: ' || SQLERRM,
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

-- Schedule the function to run every 10 seconds
SELECT cron.schedule('process-blackbox-commands', '*/10 * * * * *', 'SELECT process_active_blackbox_commands();');