# Unified Creator Identity — Full Wire-Up, Backfill, Crons & Audits

Goal: take the parallel `fuseCreator` system and make it the **active, automatic** identity layer. Every natural place a wallet/social signal lands → fusion runs. Existing 58,628 `developer_profiles` get backfilled. Cron jobs keep it converging. Audits + morning report surface what happened. Zero silent fails.

---

## What gets done (in this exact order)

### 1. Wire `fuseCreator()` into live write paths

Every existing function that mints a `developer_profiles` row or learns a new social signal will call fusion **after** its existing work, fire-and-forget but with explicit error logging into a new audit table (so a transient fusion hiccup never breaks the core write).

Functions to edit (8 hooks total):

| Function | Signal it contributes |
|---|---|
| `token-creator-linker` | dev wallet (pump.fun creator) — replace its bespoke insert with fusion |
| `developer-discovery-job` | dev wallet + display_name |
| `developer-enrichment` | dev wallet + twitter/telegram/discord/website |
| `oracle-auto-classifier` | dev wallet + classification metadata |
| `oracle-x-reverse-lookup` | x_user_id + x_handle → wallet |
| `family-discovery-engine` | sister wallets cluster |
| `rug-event-processor` | rug-flagged dev wallet |
| `flipit-execute` | dev wallet at execution |

Plus two **social** write hooks (so an X handle alone creates/updates a profile):

| Function | Signal |
|---|---|
| `harvest-token-socials` | x_handle, telegram_handle, website_domain (per token_mint → look up creator wallet, fuse) |
| `social-links-backfill` | same — bulk path |

Every call uses `assertDbWrite`-friendly try/catch that logs failures into `creator_fusion_audit` (new table) but never throws past the host function — fusion is auxiliary, host writes must succeed.

### 2. Replace `token-creator-linker`'s bespoke profile creation

Today it does its own `developer_profiles` insert + `developer_wallets` insert. After this, it calls `fuseCreator({devWallet, source:'token-creator-linker'})` and uses the returned `creatorId` for downstream `token_lifecycle.developer_id` and `developer_tokens.developer_id`. This stops creating duplicate profiles for the same wallet.

### 3. One-shot full backfill (executed automatically, not waiting on a button)

Run `creator-profile-backfill` in a paged loop until `done:true`. Handles all 461 lifecycle rows with a creator wallet + their social links. Then run a second backfill pass over `developer_profiles` rows that have any of `twitter_handle / telegram_handle / discord_handle / website_url` so we capture the other 58k profiles' existing signals.

### 4. New audit + maintenance tables

```sql
create table creator_fusion_audit (
  id uuid pk default gen_random_uuid(),
  ts timestamptz default now(),
  source text not null,           -- which function triggered fusion
  signals jsonb not null,         -- the input bag
  creator_id uuid,                -- result (null on failure)
  is_new boolean,
  merged_absorbed_ids uuid[],
  aliases_written int,
  status text not null,           -- 'success' | 'error'
  error text
);
create index on creator_fusion_audit (ts desc);
create index on creator_fusion_audit (status, ts desc);
```

Plus a tiny RPC `prune_creator_fusion_audit()` that deletes success rows older than 14 days and error rows older than 90 days.

### 5. Recurring crons (added via `pg_cron`, persisted)

| Cron | Schedule | Purpose |
|---|---|---|
| `creator-fusion-rolling-backfill` | every 30 min | calls `creator-profile-backfill` with `{limit:500}` rolling through new lifecycle rows + any developer_profiles that still have null aliases |
| `creator-fusion-audit-prune` | daily 04:15 | runs `prune_creator_fusion_audit()` |
| `creator-fusion-integrity-recalc` | daily 04:30 | re-runs `calculate-developer-integrity` for any creator with new merges in last 24h so integrity scores reflect fused identities |

Wired via `cron.schedule` using a new `_shared/cron-guard.ts` no-op + a re-assert step in the migration (so if a remix wipes them, re-running the migration restores them — protects against "lost cron" risk).

### 6. Surface in morning report

Add to `morning-report` function (and a migration for the columns if missing):
- `fused_creators_total`, `fused_creators_new_24h`, `merges_24h`
- `fusion_failures_24h` (red flag)
- `top_creators_by_token_count_24h` (jsonb)

Section appears in the daily morning email/report.

### 7. Insiders panel polish (no behavior change, just truthful labels)

Header re-phrased per your earlier note: `"422 token projects across N creator profiles · M KYC roots"`. The `CreatorProfileDrawer` gains a "Tokens by this Creator" list pulling `developer_tokens` joined to `token_lifecycle` (mint, symbol, peak multiplier, rug status, launch date).

---

## Failure & observability guarantees

- Every fusion call wrapped: success → `creator_fusion_audit` row (`status='success'`); failure → `status='error'` row with full error + signals, **plus** the host function continues so we never break the upstream pipeline.
- All DB writes inside fusion already use `assertDbWrite` (per the zero-tolerance constraint memory) — so a real DB error escalates correctly via SMS + `edge_function_runs` failure.
- Cron jobs use the standard `net.http_post` pattern from the schedule-jobs guidance and are inserted via the data-insert tool so they survive remixes properly.
- Audit pruning prevents the audit table from growing unbounded (per the storage-management memory).

---

## Files touched

**New**
- `supabase/migrations/<timestamp>_creator_fusion_audit_and_morning_columns.sql` — audit table, prune RPC, morning_report columns
- `supabase/functions/_shared/fuse-and-audit.ts` — shared helper: `await fuseAndAudit(signals, supabase)` wraps fuseCreator + audit row + try/catch
- (data insert) `cron.schedule(...)` x3

**Edited (fusion hook added)**
- `supabase/functions/token-creator-linker/index.ts` (also: replace bespoke insert)
- `supabase/functions/developer-discovery-job/index.ts`
- `supabase/functions/developer-enrichment/index.ts`
- `supabase/functions/oracle-auto-classifier/index.ts`
- `supabase/functions/oracle-x-reverse-lookup/index.ts`
- `supabase/functions/family-discovery-engine/index.ts`
- `supabase/functions/rug-event-processor/index.ts`
- `supabase/functions/flipit-execute/index.ts`
- `supabase/functions/harvest-token-socials/index.ts`
- `supabase/functions/social-links-backfill/index.ts`
- `supabase/functions/morning-report/index.ts` — fusion stats block
- `src/components/admin/tabs/InsidersLifecycleTab.tsx` — header phrasing
- `src/components/admin/CreatorProfileDrawer.tsx` — "Tokens by this Creator" list

**Executed automatically (no button)**
- Paged loop hitting `creator-profile-backfill` until `done`
- Second pass over `developer_profiles` with social fields
- `cron.schedule` for the three new jobs

---

## Out of scope (intentional)

- Bubble Map / Oracle / Telegram bots still read `reputation_mesh` / `developer_profiles` directly. Fusion is non-destructive — tombstones keep their FKs alive. Migrating the read side is a follow-up that I'll plan separately when you want it.
- No new RLS policy changes — `creator_fusion_audit` is admin-only via existing super-admin RLS pattern.
