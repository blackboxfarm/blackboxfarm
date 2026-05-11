---
name: Creator Backfill Exclusions
description: Dead pumpfun_watchlist tokens with ATH <$25k are skipped from creator-wallet backfill queue
type: constraint
---

`backfill-creator-wallets` MUST exclude `pumpfun_watchlist` rows where `status IN ('dead','rejected')` AND (`ath_market_cap_usd < 25000` OR null on a dead row). These are already filtered out of `master_token_directory`, so resolving their creators wastes Birdeye credits and pushes real launches further back in the queue. Dead tokens with ATH ≥ $25k still pass through (they matter for autopsy/dev reputation — this catches tokens that reached ~75% of the current ~$33k bonding price before rugging).
