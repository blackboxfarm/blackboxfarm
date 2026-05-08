-- Widen trust_level check to include the new honest tier
ALTER TABLE public.dev_wallet_reputation
  DROP CONSTRAINT IF EXISTS dev_wallet_reputation_trust_level_check;

ALTER TABLE public.dev_wallet_reputation
  ADD CONSTRAINT dev_wallet_reputation_trust_level_check
  CHECK (trust_level = ANY (ARRAY[
    'blacklisted','suspicious','unknown','neutral','trusted','verified',
    'scammer','serial_rugger','repeat_loser','low_quality_launcher',
    'legitimate_builder','success'
  ]));

-- Backfill: demote false-positive serial_rugger labels (rugs = 0)
UPDATE public.dev_wallet_reputation
SET trust_level = CASE
    WHEN COALESCE(tokens_abandoned, 0) >= 10 THEN 'low_quality_launcher'
    WHEN COALESCE(tokens_abandoned, 0) >= 3  THEN 'repeat_loser'
    ELSE 'suspicious'
  END,
  is_serial_spammer = CASE
    WHEN COALESCE(tokens_abandoned, 0) >= 10 THEN true
    ELSE COALESCE(is_serial_spammer, false)
  END,
  updated_at = now()
WHERE trust_level = 'serial_rugger'
  AND COALESCE(tokens_rugged, 0) = 0;

-- Also fix 'scammer' rows that have no actual rugs (false positives from old classifier)
UPDATE public.dev_wallet_reputation
SET trust_level = CASE
    WHEN COALESCE(tokens_abandoned, 0) >= 10 THEN 'low_quality_launcher'
    WHEN COALESCE(tokens_abandoned, 0) >= 3  THEN 'repeat_loser'
    ELSE 'suspicious'
  END,
  updated_at = now()
WHERE trust_level = 'scammer'
  AND COALESCE(tokens_rugged, 0) = 0;