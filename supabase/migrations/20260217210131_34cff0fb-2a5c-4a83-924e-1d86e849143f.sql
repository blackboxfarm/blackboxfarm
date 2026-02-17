-- Fix dev_wallet_reputation check constraint to include 'scammer'
ALTER TABLE dev_wallet_reputation DROP CONSTRAINT dev_wallet_reputation_trust_level_check;
ALTER TABLE dev_wallet_reputation ADD CONSTRAINT dev_wallet_reputation_trust_level_check 
  CHECK (trust_level = ANY (ARRAY['blacklisted', 'suspicious', 'unknown', 'neutral', 'trusted', 'verified', 'scammer', 'serial_rugger', 'repeat_loser']));

-- Fix developer_profiles check constraint to include 'blacklisted'
ALTER TABLE developer_profiles DROP CONSTRAINT developer_profiles_trust_level_check;
ALTER TABLE developer_profiles ADD CONSTRAINT developer_profiles_trust_level_check 
  CHECK (trust_level = ANY (ARRAY['trusted', 'neutral', 'suspicious', 'scammer', 'blacklisted']));