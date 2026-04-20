

## Project Health Audit — Last 48 Hours

I went through the edge function run table, Postgres error log, and individual function logs. Here is what's actually going wrong, ranked by severity.

---

### 🔴 Tier 1 — Active functional bugs (need fixing)

| # | Function | Errors | Root cause | Impact |
|---|---|---|---|---|
| 1 | **`flipit-execute`** | 285 (70% of API calls) | All failing with `"buyAmountSol required"` after 226ms — a caller is invoking the buy endpoint without the SOL amount field | Failed buys from web/admin UI. Telegram path works (only 7/58 fail there). |
| 2 | **`oracle-historical-backfill`** | 96 (100% fail rate) | `duplicate key value violates unique constraint "oracle_backfill_jobs_target_date_key"` — function tries to insert a job for a date already done; no upsert / no skip-if-exists | Cron runs every 15 min and **always fails**. Dead loop. |
| 3 | **`x-community-enricher`** | 80 (100% fail rate, holders-intel-poster cron) | HTTP 400 on every call; only "RunLogger insert" warnings visible — actual failure cause not being logged before throw | Silent feature breakage. Communities never enriched. |
| 4 | **`telegram-mtproto-auth`** | 109 / ~12k (0.9%) | HTTP 500 occurring ~once every 3-5 min — likely upstream Telegram MTProto session glitch | Intermittent member-audit failures |
| 5 | **`telegram-channel-monitor`** | 263 / ~11k (~2.4%) | HTTP 429 — Telegram rate-limit being hit by the 4-shard 15-second cron | Some Telegram channel updates missed |
| 6 | **`raydium-swap`** | 56 / 229 (24%) | HTTP 400 (last seen yesterday 19:31) | Swap failures, smaller volume |
| 7 | **`bagless-holders-report`** | 20 (2.3%) | HTTP 500 | Small leak, mostly OK |
| 8 | **`stripe-webhook`** | 10 HTTP 500 | No log retained; could be signature verification or downstream DB | Payment events possibly dropped |
| 9 | **`check-subscription`** | 12 HTTP 500 | Same as above — no log body | Subscription gate may flicker |

---

### 🟠 Tier 2 — Database errors (unrelated to the function 4xx/5xx)

From `postgres_logs`, last 48h, ranked:

| Count | Error | Where |
|---|---|---|
| **606** | `duplicate key value violates unique constraint "edge_function_runs_pkey"` | `_shared/run-logger.ts` — race between fire-and-forget INSERT and the UPDATE/UPSERT on completion. Cosmetic, but pollutes logs. |
| 49 | `invalid input syntax for type uuid: "undefined"` | Some caller is passing the literal string `"undefined"` as a UUID parameter |
| 17 | `dev_wallet_reputation_trust_level_check` violated | Code is trying to insert a `trust_level` value not allowed by the CHECK constraint |
| 18 | `invalid input syntax for type json` | Malformed JSON being inserted somewhere |
| 7 | `column kol_wallets.kol_tier does not exist` | Stale code referencing a removed/renamed column |
| 7 | `column pumpfun_blacklist.wallet_address does not exist` | Same — stale schema reference |
| 7 | `column token_search_results.holder_count does not exist` | Same |
| 7 | `column "COALESCE" does not exist` | A SQL string is missing parentheses — `COALESCE` parsed as identifier |
| 7 | RLS denial on `premium_feature_views` | Insert policy missing for the role attempting it |
| 4 | `null value in "first_seen_at" of token_lifecycle` | Insert path not setting required field |
| 3 | RLS denial on `holders_page_visits` | Same RLS issue pattern |
| 1 | `developer_profiles.master_wallet does not exist` | Stale reference |

---

### 🟢 Tier 3 — Healthy

These ran 100% green over 48h: `sol-price`, `wallet-genealogy-scanner`, `flipit-notify`, `flipit-tweet`, `admin-notify`, `holders-intel-poster`, `holders-intel-scheduler`, `harvest-token-socials`, `dex-paid-checker`, `funnel-feed-scanner`, `post-share-card-twitter`, `search-surge-scanner`, `solscan-creator-lookup`, `promo-poster`. The core trading + intel pipeline is solid.

---

### Recommended fix order (when you give the go-ahead)

1. **`flipit-execute` "buyAmountSol required"** — find the caller, add the missing field. Highest impact (real failed buys).
2. **`oracle-historical-backfill` duplicate key** — change INSERT to `ON CONFLICT (target_date) DO NOTHING`. One-line fix, kills 96 errors/day.
3. **`x-community-enricher` HTTP 400** — wire the actual error message into RunLogger before throwing so we can see *why* it 400s. Then fix.
4. **Stale-column SQL** (`kol_tier`, `pumpfun_blacklist.wallet_address`, `token_search_results.holder_count`, `developer_profiles.master_wallet`, the `COALESCE` typo) — grep the codebase for each and remove/rename.
5. **`run-logger.ts` duplicate-key noise** — either change the upsert path to `onConflict: 'id'` or skip the second insert when the first already succeeded. Cosmetic but 606 errors/day.
6. **`trust_level` CHECK violation** — find the writer, align value with allowed enum. 17 errors/day.
7. **RLS on `premium_feature_views` and `holders_page_visits`** — add the missing INSERT policy or fix the calling auth context.
8. **`stripe-webhook` / `check-subscription` 500s** — add structured error logging via `withRunLog` so the next failure surfaces the cause.
9. **`telegram-channel-monitor` 429s** — slow one of the 4 shards or stagger the 15-second cadence.
10. **`telegram-mtproto-auth` 500s** — wrap in retry + log Telegram error code.

### Out of scope unless you want it
- The `dex-top-200` 502 from yesterday was a one-off (1/95 runs) — ignore.
- Collation version warnings on `template1`/`postgres` — Supabase platform thing, not actionable from our side.

