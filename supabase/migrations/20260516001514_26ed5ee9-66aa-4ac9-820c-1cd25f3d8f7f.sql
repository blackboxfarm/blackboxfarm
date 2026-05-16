-- Purge false-positive mint detections produced by the broken
-- family-mint-monitor heuristics (any pump.fun program interaction
-- was being labeled a "PROBABLE_DEV_ASSOCIATED_MINT", and any inner
-- initializeMint where the wallet was a tag-along account was labeled
-- "SIBLING_WALLET_MINT" / "FAMILY_EARLY_ENTRY"). Detection logic was
-- rewritten to require fee-payer + real initializeMint instruction.

DELETE FROM allstar_mint_alerts
WHERE metadata->>'source' = 'family_mint_monitor'
  AND metadata->>'event_type' IN (
    'PROBABLE_DEV_ASSOCIATED_MINT',
    'SIBLING_WALLET_MINT',
    'FAMILY_EARLY_ENTRY'
  );

DELETE FROM wallet_family_mint_events
WHERE event_type IN (
  'PROBABLE_DEV_ASSOCIATED_MINT',
  'SIBLING_WALLET_MINT',
  'FAMILY_EARLY_ENTRY'
);