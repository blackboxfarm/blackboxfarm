-- Backfill kyc_label for already-resolved Insiders rows by extracting the
-- cexName from the existing genealogy_chain JSON (the value is sitting in
-- the kyc_root hop but was never copied into the kyc_label column).
UPDATE telegram_insider_token_lifecycle t
SET kyc_label = sub.cex_name
FROM (
  SELECT
    id,
    (
      SELECT hop->>'cexName'
      FROM jsonb_array_elements(genealogy_chain::jsonb) AS hop
      WHERE hop->>'role' = 'kyc_root'
        AND hop->>'cexName' IS NOT NULL
        AND hop->>'cexName' <> ''
      ORDER BY (hop->>'depth')::int ASC
      LIMIT 1
    ) AS cex_name
  FROM telegram_insider_token_lifecycle
  WHERE kyc_status = 'kyc_resolved'
    AND (kyc_label IS NULL OR kyc_label = '' OR kyc_label = 'Unknown CEX')
    AND genealogy_chain IS NOT NULL
) sub
WHERE t.id = sub.id
  AND sub.cex_name IS NOT NULL;