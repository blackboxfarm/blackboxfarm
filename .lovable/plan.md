# Mesh-First Autopsy Hydration

## The problem (why $UNCRAFT and MCUNC came out generic)

When you paste a mint into the **Autopsies → Manual Add** field, the current `addManualCandidate()` flow does:

1. Insert a bare row into `autopsy_candidates` with only `token_mint` (no ticker, name, socials, creator, mcap, holders, dev dossier, x_community counts — all `NULL`).
2. Fire 4 enrichment calls *that all assume the row is already populated*:
   - `autopsy-tx-timeline` → needs creator_wallet (often null → bails)
   - `autopsy-tg-deep-pull` → needs `tg_url` (null → no-op)
   - `autopsy-community-sweep` → needs x community handle (null → no-op)
   - `autopsy-writer` → AI prompt with 90% NULLs → produces a vacuum report
3. Each `.catch(() => null)` swallows failures silently — violates the **zero-tolerance silent-fails** rule and leaves you with no idea what actually fired.

Result: ticker stays `null`, no socials, no holders, no dev wallet, no x community map → AI has nothing to write about. That's why $GPT (which I researched manually before writing) is full and $UNCRAFT / MCUNC are vacuums.

For comparison, `/holders` and `/bubblemap` both call `ingestPublicCAQuery()` first, which:
- bumps `holders_intel_seen_tokens`,
- calls `meshFeed.token()` (resolves creator from pump.fun/bonk.fun/bags, registers x/tg/website handles in mesh, links creator wallet),
- queues the token for posting.

Manual autopsy adds bypass all of that.

## The fix — one shared waterfall, no surface bypasses it

Build a **single hydration orchestrator** (`token-mesh-hydrate`) that any surface (manual autopsy add, /holders, /bubblemap, telegram bot, oracle) can call to guarantee a fully populated mesh row for a given mint. Every step returns `{ ok, source, evidence | reason }` and emits a toast on the caller.

```text
INPUT: mint (anything else optional)
  │
  ├─[1] READ-BEFORE-FETCH cache (token_lifecycle, <5min)
  │     hit  → seed result, skip to step 7
  │     miss → continue
  │
  ├─[2] IDENTITY      DexScreener → Pump.fun → Helius getAsset → Bonk → Bags
  │     resolves: ticker, name, creator_wallet, socials, mcap, fdv, liq, ath
  │     fail-all → toast "identity: no provider responded — retry?"
  │
  ├─[3] MESH INGEST   ingestPublicCAQuery() (token + creator + socials + queue)
  │
  ├─[4] CREATOR CHAIN resolveTokenCreator + discoverFundingChain (Helius)
  │     → upstream funders, KYC root, dev_wallet_reputation row
  │
  ├─[5] SOCIAL MESH   harvest-token-socials → x-community-enricher
  │                   → backfill-x-community-members (member/mod/admin counts)
  │     also: telegram-group-info if tg_url present
  │
  ├─[6] HOLDERS+ATH   capture-holder-snapshot, ath-backfill, holder-retention-analysis
  │     (only the lightweight read paths — no AI yet)
  │
  └─[7] WRITE-BACK    upsert all derived fields into autopsy_candidates (or
        token_lifecycle for non-autopsy callers) using assertUpsert.
        Return per-step status array.
```

Every step uses `assertDbWrite` (per the silent-fails rule). Per-step failures are **logged with a reason** and returned to the caller — not swallowed.

## Manual-add UX (Autopsies tab)

`AutopsyQueueBody.addManualCandidate()` becomes:

1. Insert blank candidate (as today).
2. `await supabase.functions.invoke('token-mesh-hydrate', { body: { mint, candidate_id, surface: 'autopsy_manual' } })`.
3. Stream the returned `steps[]` as toasts:
   - `✓ Identity (DexScreener): $UNCRAFT — Uncraft Inc — creator 8rHc…WWnJ`
   - `✓ Mesh ingest: 3 social handles linked`
   - `✓ Creator chain: 4 hops, KYC root = Coinbase`
   - `⚠ X community: handle not found — try manual link?`
   - `✓ Holders snapshot: 412 holders, top10 = 38%`
4. Only **after** hydration succeeds do we call the autopsy chain (`autopsy-tx-timeline` → `autopsy-tg-deep-pull` → `autopsy-community-sweep` → `autopsy-writer`).
5. **Refusal guard:** if `social_completeness < 3` AND `creator_wallet IS NULL`, refuse to call the writer with toast *"Cannot autopsy an empty object — re-hydrate or report this as a data gap."*
6. Refresh the row in `AllDrafts` from the response; ticker, mcap, socials should now be visible immediately.

## Fail-with-resolution contract

Every fetch wrapper returns one of:
- `{ ok: true, source, data }`
- `{ ok: false, reason, retry: 'auto'|'manual', alternatives: [...] }`

Toast surface:
- ✓ green = ok
- ⚠ yellow = soft fail with alternative ("DexScreener 404 — retried via Pump.fun ✓")
- ✗ red = hard fail with retry button ("Helius timeout — [Retry]")

No empty/silent paths. Every call ends with a verdict.

## Reuse — make every surface use it

After `token-mesh-hydrate` ships, swap these surfaces to use it (one line each):
- `oracle-unified-lookup` (replace inline fetch chain)
- `bagless-holders-report` (replace its identity probe)
- `check-bubble-quota` (currently calls `ingestPublicCAQuery` only — upgrade to full hydrate when a fresh CA is seen)
- Telegram bot `/holders`, `/ca`, `/dev`
- BubbleMap entry hook

Single source of truth → no more drift between surfaces.

## Re-Forensics + Re-Hydrate buttons in `AllDrafts`

- **Re-Hydrate** (new, blue) — re-runs `token-mesh-hydrate` only. Cheap, fast, no AI. Use when a row shows `null` ticker.
- **Re-Forensics** (existing) — re-runs `autopsy-tx-timeline` only.
- **Re-Generate** (existing) — re-runs `autopsy-writer` only.
- All three available in every status branch (drafted / analyzing / failed / approved).

TG buttons: keep the disabled+tooltip pattern already shipped.

---

## Technical details

**New edge function**: `supabase/functions/token-mesh-hydrate/index.ts`
- Input: `{ mint, candidate_id?, surface, force? }`
- Returns: `{ mint, identity, mesh, creatorChain, socialMesh, holders, steps: Array<{step, ok, source, ms, reason?}> }`
- Uses `withRunLog`, `assertUpsert` everywhere.
- Deduplicates against `token_lifecycle.updated_at < 5min` per `mesh-cache.ts`.

**Migration** (small):
- Add to `autopsy_candidates`: `hydration_status jsonb` (last steps array), `hydrated_at timestamptz`, `hydration_attempts int default 0`.
- Index `(token_mint)` on `autopsy_candidates` if missing.

**Edits**:
- `src/components/admin/autopsies/AutopsyQueueBody.tsx` — replace `addManualCandidate` body to call hydrate first, then writer; stream per-step toasts.
- `src/components/admin/autopsies/AllDrafts.tsx` — add **Re-Hydrate** button (cyan/blue) next to Re-Forensics; show ticker/name/mcap pulled from row; if `hydration_status` shows failed steps, badge them.
- New `src/hooks/useTokenMeshHydrate.ts` — thin wrapper that exposes `{ hydrate(mint), steps, isLoading }` for any future caller.

**Caller migration (follow-on, not blocking)**:
- `oracle-unified-lookup`, `bagless-holders-report`, `check-bubble-quota` switch to `token-mesh-hydrate` for the identity+mesh portion. Their existing scoring/output logic stays.

**Silent-fails compliance**: every DB write inside `token-mesh-hydrate` uses `assertUpsert`/`assertInsert`. External fetches never `catch(() => null)` — they either return a structured fail or throw to `withRunLog`.

## Out of scope (call out separately if you want them)

- Rewriting `$UNCRAFT` and `MCUNC` reports — that happens automatically once you hit **Re-Hydrate → Re-Generate** on each row.
- Bumping the writer prompt to refuse vacuum data — already covered by the refusal guard above; deeper prompt work is a separate task.
- Killing the 504 `autopsy-tx-timeline` timeout on heavy mints (chunked Helius pagination) — separate task.
