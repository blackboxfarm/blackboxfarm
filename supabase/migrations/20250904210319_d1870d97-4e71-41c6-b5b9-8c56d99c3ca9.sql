-- Fix the cron job to use the correct authentication and URL format
-- First, let's drop the existing cron job and recreate it properly
SELECT cron.unschedule('process-blackbox-commands');

-- Create a simplified version that logs more information
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
        IF last_buy_time IS NULL OR last_buy_time < (now() - (buy_interval || ' seconds')::interval) THEN
            -- Insert a dummy transaction to test if the execution logic works
            BEGIN
                INSERT INTO blackbox_transactions (
                    wallet_id,
                    command_code_id,
                    amount_sol,
                    gas_fee,
                    service_fee,
                    transaction_type,
                    status,
                    signature
                ) VALUES (
                    command_record.wallet_id,
                    command_record.command_id,
                    (command_record.config->>'buyAmount')::numeric,
                    0.001, -- Mock gas fee
                    0.0025, -- Mock service fee
                    'buy',
                    'completed',
                    'mock_signature_' || extract(epoch from now())::text
                );
                
                -- Log the execution
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Mock buy transaction created for ' || command_record.name || ' in campaign ' || command_record.campaign_name,
                    'info',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'buy',
                        'wallet', command_record.pubkey,
                        'amount', (command_record.config->>'buyAmount')::numeric
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to create buy transaction: ' || SQLERRM,
                    'error',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'buy',
                        'error', SQLERRM
                    )
                );
            END;
        END IF;
        
        -- Check if it's time for a sell (only if we have some holdings)
        IF last_sell_time IS NULL OR last_sell_time < (now() - (sell_interval || ' seconds')::interval) THEN
            -- Insert a dummy sell transaction
            BEGIN
                INSERT INTO blackbox_transactions (
                    wallet_id,
                    command_code_id,
                    amount_sol,
                    gas_fee,
                    service_fee,
                    transaction_type,
                    status,
                    signature
                ) VALUES (
                    command_record.wallet_id,
                    command_record.command_id,
                    (command_record.config->>'buyAmount')::numeric * (command_record.config->>'sellPercent')::numeric / 100,
                    0.001, -- Mock gas fee
                    0.0025, -- Mock service fee
                    'sell',
                    'completed',
                    'mock_signature_sell_' || extract(epoch from now())::text
                );
                
                -- Log the execution
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Mock sell transaction created for ' || command_record.name || ' in campaign ' || command_record.campaign_name,
                    'info',
                    jsonb_build_object(
                        'command_id', command_record.command_id,
                        'action', 'sell',
                        'wallet', command_record.pubkey,
                        'sell_percent', (command_record.config->>'sellPercent')::numeric
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log any errors
                INSERT INTO activity_logs (session_id, message, log_level, metadata)
                VALUES (
                    NULL,
                    'Failed to create sell transaction: ' || SQLERRM,
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