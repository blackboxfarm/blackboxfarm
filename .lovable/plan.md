
## Mission

**Find every dev wallet for every token. Find every KYC root for every dev wallet.** No row left behind.

Current state (live DB):

| Metric | Count | Gap |
|---|---|---|
| Total Insiders tokens | 1547 | — |
| Dev wallet known | 534 | **1013 missing** |
| Genealogy chain traced | 474 | 60 partial |
| KYC root resolved | 46 | **488 traced-but-no-KYC** |

Goal after this ships: **1547 / 1547 dev wallets** and **1547 / 1547 KYC verdicts** (where verdict = either a CEX label like `Binance`, or `no_kyc_reachable` after exhaustive trace).

---

## What I'll build

### 1. Schema — track per-row status so nothing falls through

Add to `telegram_insider_token_lifecycle`:

| Column | Type | Purpose |
|---|---|---|
| `creator_status` | text | `unknown` · `resolving` · `resolved` · `unresolvable` |
| `creator_last_attempt_at` | timestamptz | retry throttle |
| `creator_attempts` | int | escalation counter |
| `kyc_status` | text | `pending` · `tracing` · `kyc_resolved` · `no_kyc_reachable` · `failed` |
| `kyc_label` | text | `Binance`, `Coinbase`, `Kraken`, `MEXC`, etc. |
| `kyc_last_attempt_at` | timestamptz | retry throttle |
| `kyc_attempts` | int | escalation counter |

On migration, backfill these from existing data (rows with `genealogy_kyc_root` → `kyc_resolved` + label looked up via `cex-wallets.ts`).

### 2. New edge function — `insiders-creator-backfill` (closes the 1013 gap)

For every row with `creator_wallet IS NULL`:

1. Try Pump.fun direct (cheapest, most authoritative)
2. Fallback to Helius `getAsset` (DAS) for the mint
3. Fallback to scanning the mint's earliest signature for the `initializeMint` signer
4. If all three fail → mark `creator_status = 'unresolvable'` with reason; retry no sooner than 7 days

Batched (25), auto-loop, Helius budget guard (existing 80% rule), 250ms throttle. Newest-first.

### 3. Extend `insiders-genealogy-backfill` — exhaustive KYC walk

Current function gives up after one Helius pass. Upgrade so a token only gets `no_kyc_reachable` after a real exhaustion check:

- Walk depth **up to 30 hops** (was 20) using existing `traceParentWallets`
- At each hop, check the wallet against:
  - `cex-wallets.ts` CEX dictionary → set `kyc_label`
  - `INFRA_WALLETS` (Axiom/Photon/etc.) → terminus, mark `no_kyc_reachable` (router dead-end, not a real chain)
  - Multi-funder fork (>3 inbound funders) → take top-3 branches in parallel instead of just top-1
- Only mark `kyc_status = 'no_kyc_reachable'` after at least **2 separate trace attempts** spaced 24h apart (covers transient Helius failures)
- Persist `kyc_status`, `kyc_label`, `kyc_last_attempt_at`, increment `kyc_attempts` every time

### 4. Universal dev-wallet sweep (NEW — `dev-wallet-universal-sweep`)

You said *every* dev wallet for *every* token. The Insiders lifecycle is one source — but tokens also live in `pumpfun_watchlist`, `dex_top_200_cache`, `live_feed_curated`, etc. This new function:

- Unions every `token_mint` across all token-bearing tables
- For each mint with no known creator → run the same 3-step resolver as #2
- For each resolved creator with no KYC → enqueue into the genealogy backfill
- Writes results back to **every** table that has the mint (so `pumpfun_watchlist.creator_wallet`, `telegram_insider_token_lifecycle.creator_wallet`, etc. all stay in sync via existing creator-resolver write-back)

This guarantees the "every dev wallet for every token" promise applies project-wide, not just Insiders.

### 5. Pipeline orchestrator + cron — runs end to end every 3h

New `insiders-pipeline-orchestrator` chains them in the right order:

```text
   ┌─────────────────────────────────┐
   │  every 3h via pg_cron           │
   └──────────────┬──────────────────┘
                  ▼
   1. insiders-lifecycle-builder       (parse new TG msgs)
   2. insiders-creator-backfill        (fill missing dev wallets)
   3. dev-wallet-universal-sweep       (project-wide creator parity)
   4. insiders-genealogy-backfill      (walk creator → KYC, depth 30)
   5. insiders-genealogy-rescan-kyc    (free re-check vs CEX dictionary)
   6. insiders-cross-links             (rebuild Wallet Cross-Links cache)
```

Each step reports `{processed, remaining}`; orchestrator stops a step early if Helius budget guard trips, and continues the cheaper steps after.

### 6. UI changes in `InsidersLifecycleTab.tsx`

**New "KYC" column** (between Mesh and Actions):

| Cell | Meaning |
|---|---|
| 🏦 `Binance` (green) | Fully traced to known CEX |
| 🏦 `Coinbase` / `Kraken` / `MEXC` … | (other CEX labels from dictionary) |
| ⚪ `No KYC reachable` | Walked 30 hops, hit infra/dead-end |
| 🟡 `Tracing… (n attempts)` | In progress |
| ⚫ `No dev wallet` | Creator not yet resolved |
| 🔴 `Failed` + retry icon | Click to force-retry |

**New coverage card** (replaces "In Mesh" 0 stat):

```text
┌──────────────────────────────────────────────┐
│  Genealogy Coverage                          │
│  Dev wallets:    534 / 1547   (35%)  ▲       │
│  Chain traced:   474 / 1547   (31%)          │
│  KYC verdict:    46  / 1547   ( 3%)          │
│  Unresolvable:    0  / 1547                  │
│  [Find missing dev wallets]  [Trace to KYC]  │
└──────────────────────────────────────────────┘
```

Both buttons run the orchestrator in foreground with live toast progress.

### 7. Wallet Cross-Links — gate by full trace

Add toggle (default ON): **"Only fully-verdicted rows"** — `insiders-cross-links` filters to `kyc_status IN ('kyc_resolved','no_kyc_reachable')`. So every entry shown has been chased to its final answer (CEX hit or proven dead-end). Header badge: `224 fused creators · 305 wallets · 7 KYC roots · 46 / 1547 verdicted`.

---

## Technical details (for the dev team)

**Files**
- migration: `add_creator_and_kyc_status_to_lifecycle.sql` (+ backfill)
- new fn: `supabase/functions/insiders-creator-backfill/index.ts`
- new fn: `supabase/functions/dev-wallet-universal-sweep/index.ts`
- new fn: `supabase/functions/insiders-pipeline-orchestrator/index.ts`
- edited: `supabase/functions/insiders-genealogy-backfill/index.ts` (depth 30, multi-branch, status writes, 24h retry guard)
- edited: `supabase/functions/insiders-cross-links/index.ts` (`onlyVerdicted` flag)
- edited: `src/components/admin/tabs/InsidersLifecycleTab.tsx` (KYC column, coverage card, gate toggle)
- pg_cron: re-point existing 3h schedule at orchestrator (insert via SQL, not migration — contains URL+anon key)

**Helius budget**
- 1013 missing creators × ~3 calls ≈ 3k credits
- 488 missing-KYC × ~30 calls (depth 30 + occasional fork) ≈ 18k credits
- Universal sweep first run: ~10k credits worst case
- Total ≈ 31k of 10M monthly quota. Existing 80% guard remains.

**Idempotency**
- Status columns + `_last_attempt_at` make every step skip already-done rows.
- 24h cooldown on failed traces prevents Helius hammering.
- 7-day cooldown on `unresolvable` creators.

**Memory updates**
- Update `mem://features/oracle/dev-genealogy-tracing` — depth 30, multi-branch on fork, status-driven retry.
- New `mem://features/intelligence/insiders-pipeline-orchestrator` — 3h cron chain.

---

## Definition of done

After the first 24h of cron passes, every row in `telegram_insider_token_lifecycle` has either:

- ✅ a resolved `creator_wallet` AND a `kyc_status` of `kyc_resolved` (with label) or `no_kyc_reachable` (proven exhausted), OR
- ⚠️ `creator_status = 'unresolvable'` with a documented reason (failed mint, missing on-chain data) — these are real, not laziness.

The "In Mesh = 0" stat starts climbing because the promoter finally has trustworthy creators with KYC anchors. Wallet Cross-Links shows only entries you can audit end-to-end.

Approve and I'll build it.
