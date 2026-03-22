
-- Seed wallet_families from allstar_dev_registry
INSERT INTO wallet_families (seed_wallet, family_name, total_wallets, risk_score, total_mints_detected, created_at)
SELECT 
  adr.master_wallet,
  COALESCE('@' || adr.twitter_handle, 'Dev-' || LEFT(adr.master_wallet, 8)),
  COALESCE(adr.total_wallet_family_size, 1),
  CASE 
    WHEN adr.best_tier >= 6 THEN 15
    WHEN adr.best_tier >= 4 THEN 35
    WHEN adr.best_tier >= 2 THEN 55
    ELSE 70
  END,
  COALESCE(adr.new_mints_found, 0),
  NOW()
FROM allstar_dev_registry adr
WHERE adr.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM wallet_families wf WHERE wf.seed_wallet = adr.master_wallet
  );

-- Seed wallet_family_members (seed wallet as first member)
INSERT INTO wallet_family_members (family_id, wallet_address, label, tier, confidence_score, status, first_seen_at)
SELECT 
  wf.id,
  wf.seed_wallet,
  'seed',
  'A',
  100,
  'active',
  NOW()
FROM wallet_families wf
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_family_members wfm 
  WHERE wfm.family_id = wf.id AND wfm.wallet_address = wf.seed_wallet
);

-- Seed the poll queue for all seed wallets at P1 priority
INSERT INTO wallet_family_poll_queue (wallet_address, family_id, priority, poll_interval_sec, next_poll_at)
SELECT 
  wf.seed_wallet,
  wf.id,
  'P1',
  300,
  NOW()
FROM wallet_families wf
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_family_poll_queue pq 
  WHERE pq.wallet_address = wf.seed_wallet AND pq.family_id = wf.id
);

-- Also seed known family_wallets from allstar registry JSON array
INSERT INTO wallet_family_members (family_id, wallet_address, label, tier, confidence_score, status, first_seen_at)
SELECT 
  wf.id,
  fw.wallet::text,
  'sibling',
  'B',
  60,
  'active',
  NOW()
FROM allstar_dev_registry adr
JOIN wallet_families wf ON wf.seed_wallet = adr.master_wallet
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(adr.family_wallets, '[]'::jsonb)) AS fw(wallet)
WHERE fw.wallet IS NOT NULL 
  AND fw.wallet != ''
  AND NOT EXISTS (
    SELECT 1 FROM wallet_family_members wfm 
    WHERE wfm.family_id = wf.id AND wfm.wallet_address = fw.wallet::text
  );

-- Add known family wallets to poll queue at P2
INSERT INTO wallet_family_poll_queue (wallet_address, family_id, priority, poll_interval_sec, next_poll_at)
SELECT 
  wfm.wallet_address,
  wfm.family_id,
  'P2',
  900,
  NOW()
FROM wallet_family_members wfm
WHERE wfm.label = 'sibling'
  AND NOT EXISTS (
    SELECT 1 FROM wallet_family_poll_queue pq 
    WHERE pq.wallet_address = wfm.wallet_address AND pq.family_id = wfm.family_id
  );
