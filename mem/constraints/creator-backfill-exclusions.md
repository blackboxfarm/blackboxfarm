---
name: Creator Backfill Exclusions
description: Dead pumpfun_watchlist tokens with ATH <$25k are skipped from creator-wallet backfill queue
type: constraint
---

`backfill-creator-wallets` MUST exclude `pumpfun_watchlist` rows where `status IN ('dead','rejected')` AND (`ath_market_cap_usd < 25000` OR null on a dead row). These are already filtered out of `master_token_directory`, so resolving their creators wastes Birdeye credits and pushes real launches further back in the queue. Dead tokens with ATH ≥ $25k still pass through (they matter for autopsy/dev reputation — this catches tokens that reached ~75% of the current ~$33k bonding price before rugging).

## Birdeye infra-wallet blocklist (CRITICAL)

Birdeye's `defi/token_creation_info.owner` returns the **mint-authority owner**, which for Pump.fun-suffixed mints is the launchpad program / shared router wallet — NOT the human creator. Any wallet on this list is treated as a Birdeye miss so the caller falls through to Pump.fun coin API (Step 1 of `resolveTokenCreator`):

- `TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM` (Pump.fun launchpad, seen on 1,294+ mints)
- `2oCXSSTk2XcF4xFfjxJZjDu66c18MfzkMb8woem6K4rc`
- `FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM`
- `FWymgf7GwMXczUmqQ6jeeE4MukdZNuaRom4twz3U45nz`
- `7sA5em1nTKmLvGm8H85cpgA9hM9YvCoPp729mwe6akhh`
- `HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC`
- `7naFFwuEJWeWwWYQUkgAWHsxYKg3KctEuUj42JdAMidP`

Blocklist lives in `_shared/birdeye-creator.ts` AND `backfill-creator-wallets/index.ts` (local helper). Keep in sync. Also: `*pump`-suffixed mints in the backfill cron MUST go through the full `resolveTokenCreator` chain (Pump.fun first), not the `birdeyeOnly` fast-path. Add to the list any address observed as `creator_wallet` on 30+ unrelated mints.
