## What the mismatch means

The two screenshots are counting different things:

- **Birdeye API Usage** is counting API/log activity in `birdeye_api_usage` over the last 24h.
  - Current DB check: **4,166 Birdeye calls**, **3,384 resolved-owner log rows**, **3,277 unique token mints**, but only **95 unique creator wallets**.
  - One wallet dominates: `TSLvdd...` accounts for about **3,126 unique mints**, so this is not 3,300 distinct dev wallets.

- **Dev Wallet + KYC Coverage** is counting the canonical master directory: `master_token_directory.creator_wallet IS NOT NULL`.
  - Current DB check: **86,561 / 123,939 tokens** have a creator wallet, around **69.84%**.
  - That is why SMS did not fire again: the notifier only sends on each new whole-percent crossing. Last sent was **69%**; next is **70%**, roughly ~200 more net covered tokens away depending on total-token growth.

- Not every Birdeye “resolved owner” moves coverage:
  - Some rows are duplicate retries/calls for the same token.
  - Some tokens were already counted in the master directory.
  - About **1,044 Birdeye-resolved mints from the last 24h are excluded from `master_token_directory` because their `pumpfun_watchlist.status` is `dead` or `rejected`**.
  - The master view refresh is also timing out in recent logs: `directory refresh failed: canceling statement due to statement timeout`, so even successful base-table writes can lag in the Dev/KYC panel.

So the reconciliation is: **Birdeye is successfully finding owners, but the widget currently reports raw API/log throughput, not net master-database coverage gain.** The Dev/KYC panel is closer to canonical coverage, but it is vulnerable to materialized-view refresh lag and does not show Birdeye-specific impact.

## Implementation plan

1. **Fix the dashboard language and counts**
   - Rename Birdeye’s “resolved owner” label to make clear it means **resolved API lookups**, not “new covered master tokens.”
   - Add split stats:
     - Birdeye calls
     - unique mints resolved
     - unique creator wallets
     - resolved mints already counted in `master_token_directory`
     - resolved mints excluded as dead/rejected
     - resolved mints still pending master coverage

2. **Make Dev/KYC coverage read fresh canonical impact**
   - Add a small database read function/view for live coverage that computes current creator coverage from the base source tables plus mesh dev links, instead of relying only on the potentially stale materialized view.
   - Use that for the Dev/KYC panel and SMS notifier so the displayed percentage reflects new Birdeye writes faster.

3. **Persist Birdeye resolutions into the graph path too**
   - When Birdeye resolves a creator, write the token→creator relationship into `reputation_mesh` as a `created_token`/`dev_wallet` relationship, using `assertDbWrite`/`assertUpsert`.
   - This helps mesh-only tokens become countable by `master_token_directory` without depending only on seeding `scraped_tokens`.
   - Backfill recent `birdeye_api_usage.resolved_creator` rows into this graph path once.

4. **Remove silent write failures in the creator backfill**
   - Replace the current best-effort/silent persistence paths in `backfill-creator-wallets` with asserted writes, per the project’s zero-tolerance DB-write rule.
   - Return/write explicit counts for: API resolved, base-table updated, graph linked, skipped dead/rejected, already-covered.

5. **Fix refresh/SMS observability**
   - Stop the per-run materialized-view refresh from silently timing out as the main progress signal.
   - Add “next SMS at X% / N tokens remaining” to the Dev/KYC panel and SMS log panel.
   - Keep SMS cadence as whole-percent milestones unless you want a different cadence later.

6. **Leave first-24h ATH wiring for later**
   - Keep the ATH sealer/backfill accumulating data first.
   - In a follow-up, wire `first_24h_ath_usd` into scoring/autopsy/UI once there is enough sealed history to make the signal useful.