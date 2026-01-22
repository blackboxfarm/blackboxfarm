-- Update HoldersIntel Twitter credentials with new tokens
UPDATE twitter_accounts 
SET access_token_encrypted = '2013909155552149504-S1Etikgg65Ns8rRQD4yEi1gOO9lIAs',
    access_token_secret_encrypted = '5LEmLD2p83OhmcxrUnmNFtb53b7EVdLB4nAAoIRK6YE3e',
    updated_at = now()
WHERE username = 'HoldersIntel';