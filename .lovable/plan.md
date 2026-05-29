Mesh-first Entry MC with discovery-window guard.

## What I just landed (DB migration applied)

- New RPC `upsert_mesh_entry_mcap(mint, symbol, name, observed_mcap, source, observed_at)`:
  - Inserts new token rows directly into the main Mesh table `holders_intel_seen_tokens`.
  - Lowers `entry_mcap_usd` / `market_cap_at_discovery` ONLY when:
    - source is one of `insiders | blackbox | phanes | drrick | holdersintel | bagless`, AND
    - we are still inside the 30-minute discovery window from `first_seen_at`, AND
    - the new observed MC is lower than the stored Entry MC.
  - Any MC observed after the 30-min window is treated as a price dump and IGNORED for Entry MC. (`last_seen_at` still stamps.)
- Rebuilt `lock_entry_mcap` to use the Mesh row as the source of truth and sync `telegram_insider_token_lifecycle.entry_market_cap` from it (instead of the reverse).

## What I will build next (needs build mode)

1. Rewrite `insiders-mcap-backfill` to be the fast Mesh-first path:
   - Pull last N (default 100) Insiders messages in one query.
   - Parse Entry MC / Market Cap in memory.
   - Dedupe per `token_mint` keeping the lowest MC seen in the scanned window.
   - Bulk-call `upsert_mesh_entry_mcap` in parallel chunks of 50 (source = `insiders`).
   - No more per-row UPDATE loops, no relock pass. The RPC handles both.
   - Should finish 100 messages in seconds, not minutes.

2. Live ingest paths feed Mesh on first sight, every sight:
   - `telegram-channel-monitor`: right after inserting `telegram_channel_calls`, call `upsert_mesh_entry_mcap` with the parsed Insiders MC, source `insiders`, observed_at = message timestamp.
   - `bagless-holders-report`: replace the raw `holders_intel_seen_tokens.upsert` with a call to `upsert_mesh_entry_mcap`, source `holdersintel`, observed = `inferredMarketCapUSD`. Window guard prevents stale dumps from breaking Entry MC.
   - `no-lube-orchestrate`: keep using `lock_entry_mcap` but pass source = `blackbox` (the live probe is the BlackBox / DexScreener sweep). Window guard means probe MC will only lower Entry MC during the first 30 min — exactly the cross-source comparison you described (Insiders + BlackBox + HoldersIntel).
   - `insiders-row-ingest`: same treatment immediately after the lifecycle upsert.

3. Validation (no rewrites, just reads):
   - Run the new backfill on the last 100 Insiders messages.
   - Read `holders_intel_seen_tokens` for those mints: confirm `entry_mcap_usd` is populated and matches the lowest-of-three within the window.
   - Confirm a repeat Insiders sighting now finds the token in Mesh instantly and computes the multiplier from `current_mcap / entry_mcap_usd`.

## ASCII flow

```text
Insiders / BlackBox / HoldersIntel
     |
     v
upsert_mesh_entry_mcap(mint, mc, source)
     |
     +-- new token  -> insert into holders_intel_seen_tokens
     +-- existing + within 30min + lower -> lower entry_mcap_usd
     +-- existing + outside window -> stamp last_seen only (dump ignored)
     |
     v
lock_entry_mcap reads Mesh entry -> syncs lifecycle.entry_market_cap
     |
     v
no-lube-orchestrate: ratio = current_mcap / Mesh entry_mcap_usd
```

No secondary Insiders-only Entry MC table is created. Mesh is the only source of truth.