## What's actually broken

Confirmed from the DB and cron table:

- `telegram-channel-monitor` IS on cron (every 15s × 4 stagger) — messages keep flowing into `telegram_channel_calls`. ✅
- `insiders-lifecycle-builder` is **NOT on cron** — only fires when you click "Rebuild from messages". Last build: yesterday 21:47 UTC.
- `insiders-mesh-promoter` is **NOT on cron** — never run. 0 promoted.
- Of 823 lifecycle tokens, **822 have no `creator_wallet`**, so the promoter marks all 150 ≥3x tokens as `not_eligible` and skips. That's why the table looks empty.
- Lifecycle builder doesn't enrich anything — no creator resolution, no socials, no genealogy, no DEX-vs-launchpad social diff. It's a dumb message aggregator.

So the user is right: this needs to be on a cron AND each token needs the full mesh treatment.

## The fix — 3 parts

### 1. Upgrade `insiders-lifecycle-builder` to enrich every token

After the existing message aggregation + upsert, add a per-token enrichment loop that runs for every token (full pass on first cron run, then incremental) doing:

- **Creator resolution** via `_shared/creator-resolver.ts` (Pump.fun → Helius → DAS → DB cache). Write `creator_wallet` and `creator_resolved_at` back to `telegram_insider_token_lifecycle`.
- **Mesh feed** — call `meshFeed.token()` and `meshFeed.wallet()` from `_shared/mesh-feeder.ts` so the token + creator land in `reputation_mesh`.
- **Social discovery** — for each token, fetch:
  - Launchpad socials (Pump.fun / Bonk.fun / Bags.fm via existing `fetchPumpFunCoin` + sister helpers)
  - DexScreener socials (already have `dex-top-200` cache + on-demand fetch)
  - Metaplex on-chain URI socials (`social-link-mint-checker` logic)
  - Diff them, upsert each into `token_social_links` with a `source` ('launchpad' | 'dex' | 'metaplex') and `observed_at` so changes over time become a history. If the same handle appears in launchpad and dex → that's confirmation. If they differ → flag `socials_changed` on the lifecycle row.
- **Auto-genealogy** — call `traceParentWallets()` from `_shared/auto-genealogy.ts` on the creator wallet, up to depth 8 (existing default), to find KYC root via CEX hot-wallet match. Store result on `dev_wallet_reputation` (already what genealogy meshing does).
- **No silent fails** — wrap every write with `assertDbWrite` per the project's zero-tolerance rule. Log per-token enrichment outcome (creator: yes/no, socials: N found, genealogy: depth/KYC).

Concurrency: process tokens in batches of 5 with small delays to respect Helius/Pump.fun governance (200-300/hr Pump.fun, 5s throttle; Helius credits monthly cap).

Priority order inside the cron pass: highest `peak_multiplier` first (most successful = most important, exactly as you said), then newest. Always re-check the top-50 most recent tokens for socials drift on every run.

### 2. Wire `insiders-mesh-promoter` to run after enrichment

In the same cron run, after the enrichment pass finishes, call the promoter so any newly-resolved creators on ≥3x tokens get promoted to `reputation_mesh` as good actors (existing logic already handles this correctly — it just couldn't fire before because creators were null).

### 3. Add the cron job — every 3 hours

Single `pg_cron` job (`insiders-lifecycle-full-3h`):
- Calls a new orchestrator endpoint OR sequentially hits `insiders-lifecycle-builder` then `insiders-mesh-promoter` (cleaner: have the builder call the promoter at the end of its run, keep the cron to one HTTP call).
- Schedule: `0 */3 * * *` (top of the hour, every 3h).
- First run on deploy will be the "complete refetch + full mesh build for all 823 tokens" the user asked for. Subsequent runs are incremental + drift checks.

### Files I will touch

- `supabase/functions/insiders-lifecycle-builder/index.ts` — add enrichment loop (creator resolve + mesh feed + socials diff + genealogy + assertDbWrite + chain to promoter at end).
- New migration: `pg_cron` job `insiders-lifecycle-full-3h` (every 3h).
- (Optional, only if needed) one new column on `telegram_insider_token_lifecycle`: `socials_last_checked_at timestamptz`, `socials_changed boolean default false` — so the UI can show drift.

### What I am NOT doing

- Not touching `telegram-channel-monitor` (already on cron, working).
- Not rewriting `creator-resolver`, `mesh-feeder`, `auto-genealogy`, or `social-link-mint-checker` — reusing them as-is.
- Not changing the UI (the existing buttons keep working; cron just makes manual clicks unnecessary).

### Outcome after deploy

- Within minutes of the first cron tick: all 823 tokens get a creator-resolution attempt, mesh links written, socials snapshotted, KYC traced. The UI table will start filling in `Mesh: Promoted` (or `Pending` with concrete reason) instead of being empty.
- Every 3 hours after that: re-checks top-50 newest for social drift, attempts to resolve any creators that failed last time, promotes any new ≥3x tokens.
- `mesh_decision_trace` on each row tells you exactly why a token did or didn't get promoted — no more "fail to find KYC" silent shrugs.

Approve and I'll execute it in one pass.