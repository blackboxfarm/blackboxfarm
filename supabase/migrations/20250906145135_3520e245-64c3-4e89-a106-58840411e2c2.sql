-- First, let's check and fix foreign key constraints to prevent cascade deletion
-- The issue is likely that campaign_wallets has ON DELETE CASCADE

-- Drop the existing foreign key constraint that causes cascade deletion
ALTER TABLE campaign_wallets 
DROP CONSTRAINT IF EXISTS campaign_wallets_campaign_id_fkey;

-- Add it back without CASCADE, so deleting campaigns doesn't delete wallet associations
ALTER TABLE campaign_wallets 
ADD CONSTRAINT campaign_wallets_campaign_id_fkey 
FOREIGN KEY (campaign_id) REFERENCES blackbox_campaigns(id) ON DELETE SET NULL;

-- Also check blackbox_command_codes foreign key
ALTER TABLE blackbox_command_codes 
DROP CONSTRAINT IF EXISTS blackbox_command_codes_wallet_id_fkey;

-- Add it back without CASCADE
ALTER TABLE blackbox_command_codes 
ADD CONSTRAINT blackbox_command_codes_wallet_id_fkey 
FOREIGN KEY (wallet_id) REFERENCES blackbox_wallets(id) ON DELETE SET NULL;

-- Update campaign_wallets to allow NULL campaign_id for orphaned wallets
ALTER TABLE campaign_wallets 
ALTER COLUMN campaign_id DROP NOT NULL;

-- Update blackbox_command_codes to allow NULL wallet_id for orphaned commands  
ALTER TABLE blackbox_command_codes 
ALTER COLUMN wallet_id DROP NOT NULL;