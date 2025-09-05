-- Allow wallets to exist without a campaign by making campaign_id nullable
ALTER TABLE blackbox_wallets ALTER COLUMN campaign_id DROP NOT NULL;