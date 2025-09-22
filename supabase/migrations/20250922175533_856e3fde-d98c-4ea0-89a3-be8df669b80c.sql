-- Phase 1: Create proper cascade deletion for campaigns
-- First, let's add a function to completely delete a campaign and all its data

CREATE OR REPLACE FUNCTION public.delete_campaign_cascade(campaign_id_param uuid, campaign_type_param text DEFAULT 'blackbox')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    deleted_counts jsonb := '{}';
    wallet_ids uuid[];
    command_ids uuid[];
BEGIN
    -- Verify user owns the campaign
    IF campaign_type_param = 'blackbox' THEN
        IF NOT EXISTS (
            SELECT 1 FROM blackbox_campaigns 
            WHERE id = campaign_id_param AND user_id = auth.uid()
        ) THEN
            RAISE EXCEPTION 'Campaign not found or access denied';
        END IF;
    ELSIF campaign_type_param = 'community' THEN
        IF NOT EXISTS (
            SELECT 1 FROM community_campaigns 
            WHERE id = campaign_id_param AND creator_id = auth.uid()
        ) THEN
            RAISE EXCEPTION 'Campaign not found or access denied';
        END IF;
    END IF;

    -- Get wallet and command IDs for this campaign
    SELECT array_agg(bw.id) INTO wallet_ids
    FROM blackbox_wallets bw
    JOIN campaign_wallets cw ON bw.id = cw.wallet_id
    WHERE cw.campaign_id = campaign_id_param;

    SELECT array_agg(bcc.id) INTO command_ids
    FROM blackbox_command_codes bcc
    JOIN blackbox_wallets bw ON bcc.wallet_id = bw.id
    JOIN campaign_wallets cw ON bw.id = cw.wallet_id
    WHERE cw.campaign_id = campaign_id_param;

    -- Delete transactions
    WITH deleted_transactions AS (
        DELETE FROM blackbox_transactions 
        WHERE campaign_id = campaign_id_param
        RETURNING id
    )
    SELECT jsonb_build_object('transactions', count(*)) INTO deleted_counts
    FROM deleted_transactions;

    -- Delete command codes
    IF command_ids IS NOT NULL THEN
        WITH deleted_commands AS (
            DELETE FROM blackbox_command_codes 
            WHERE id = ANY(command_ids)
            RETURNING id
        )
        SELECT deleted_counts || jsonb_build_object('commands', count(*)) INTO deleted_counts
        FROM deleted_commands;
    END IF;

    -- Delete campaign wallet relationships
    WITH deleted_relationships AS (
        DELETE FROM campaign_wallets 
        WHERE campaign_id = campaign_id_param
        RETURNING id
    )
    SELECT deleted_counts || jsonb_build_object('wallet_relationships', count(*)) INTO deleted_counts
    FROM deleted_relationships;

    -- Delete wallets (only if they're not used by other campaigns)
    IF wallet_ids IS NOT NULL THEN
        WITH deleted_wallets AS (
            DELETE FROM blackbox_wallets 
            WHERE id = ANY(wallet_ids)
            AND NOT EXISTS (
                SELECT 1 FROM campaign_wallets cw2 
                WHERE cw2.wallet_id = blackbox_wallets.id
            )
            RETURNING id
        )
        SELECT deleted_counts || jsonb_build_object('wallets', count(*)) INTO deleted_counts
        FROM deleted_wallets;
    END IF;

    -- Delete campaign timing
    WITH deleted_timing AS (
        DELETE FROM campaign_timing 
        WHERE campaign_id = campaign_id_param
        RETURNING id
    )
    SELECT deleted_counts || jsonb_build_object('timing', count(*)) INTO deleted_counts
    FROM deleted_timing;

    -- Delete campaign notifications
    WITH deleted_notifications AS (
        DELETE FROM campaign_notifications 
        WHERE campaign_id = campaign_id_param
        RETURNING id
    )
    SELECT deleted_counts || jsonb_build_object('notifications', count(*)) INTO deleted_counts
    FROM deleted_notifications;

    -- Finally delete the campaign itself
    IF campaign_type_param = 'blackbox' THEN
        DELETE FROM blackbox_campaigns WHERE id = campaign_id_param;
        SELECT deleted_counts || jsonb_build_object('campaign', 1) INTO deleted_counts;
    ELSIF campaign_type_param = 'community' THEN
        DELETE FROM community_campaigns WHERE id = campaign_id_param;
        SELECT deleted_counts || jsonb_build_object('campaign', 1) INTO deleted_counts;
    END IF;

    RETURN deleted_counts;
END;
$$;

-- Phase 2: Fix the attribution issues for the current user
-- Get the correct user ID and campaign ID
DO $$
DECLARE
    correct_user_id uuid;
    alba_campaign_id uuid;
    bagless_campaign_id uuid;
    alba_wallet_id uuid;
BEGIN
    -- Find the user with OrangTUAH campaign (this should be the correct user)
    SELECT user_id, id INTO correct_user_id, alba_campaign_id
    FROM blackbox_campaigns 
    WHERE nickname = 'OrangTUAH' 
    LIMIT 1;

    -- Find the BAGLESS campaign
    SELECT id INTO bagless_campaign_id
    FROM blackbox_campaigns 
    WHERE nickname = 'BAGLESS' 
    LIMIT 1;

    -- Find the wallet for ALBA campaign
    SELECT bw.id INTO alba_wallet_id
    FROM blackbox_wallets bw
    JOIN campaign_wallets cw ON bw.id = cw.wallet_id
    WHERE cw.campaign_id = alba_campaign_id
    LIMIT 1;

    IF correct_user_id IS NOT NULL AND alba_campaign_id IS NOT NULL AND bagless_campaign_id IS NOT NULL THEN
        -- Update transactions that should belong to ALBA campaign
        UPDATE blackbox_transactions 
        SET campaign_id = alba_campaign_id
        WHERE campaign_id = bagless_campaign_id
        AND wallet_id = alba_wallet_id;

        -- Update command codes to belong to correct user
        UPDATE blackbox_command_codes 
        SET user_id = correct_user_id
        WHERE wallet_id = alba_wallet_id
        AND (user_id IS NULL OR user_id != correct_user_id);

        RAISE NOTICE 'Fixed attribution for user % and campaign %', correct_user_id, alba_campaign_id;
    END IF;
END;
$$;

-- Phase 3: Add constraints to prevent future issues
ALTER TABLE blackbox_command_codes 
ADD CONSTRAINT check_user_campaign_consistency 
CHECK (
    user_id IS NULL OR 
    EXISTS (
        SELECT 1 FROM blackbox_wallets bw
        JOIN campaign_wallets cw ON bw.id = cw.wallet_id
        JOIN blackbox_campaigns bc ON cw.campaign_id = bc.id
        WHERE bw.id = wallet_id AND bc.user_id = user_id
    )
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_blackbox_transactions_campaign_wallet 
ON blackbox_transactions(campaign_id, wallet_id);

CREATE INDEX IF NOT EXISTS idx_campaign_wallets_campaign_id 
ON campaign_wallets(campaign_id);