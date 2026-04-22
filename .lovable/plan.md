

# Insiders Lifecycle — Honest Reporting & Mesh Transparency

Four upgrades to the Insiders Lifecycle tab that make the data fully honest and the mesh-promotion logic transparent.

## What you'll get

### 1. "Saddev / Poor Launch" category (the 425 missing tokens)
- Add a new summary card: **Never hit 2x** (currently 425 of 633 tokens — the silent majority).
- Add filter options: `< 2x (saddev)`, `Dud (1 milestone only)`, `Dead on arrival (no milestone)`.
- Default min-X dropdown gains a `≥ 1x (show all)` option so duds become visible.
- New badge column: tokens with `peak_multiplier < 2` get a grey **"Saddev"** badge so they're scannable.

### 2. Export to CSV
- New **Export CSV** button (top-right of controls). Exports the *currently filtered* view.
- Columns: First called, Symbol, Mint (full), Entry MC, Peak X, Peak MC, Lifespan minutes, Milestones, Creator wallet, Mesh status, Mesh reason.

### 3. Fix the MAGA false-rug + make Mesh logic visible

**The bug:** MAGA's creator wallet has `trust_level='scammer'` and `tokens_rugged=1` in `dev_wallet_reputation` — flagged for a *previous* token. The promoter then marks **every** token that wallet ever touched as "rug". That's why MAGA (a 131x performer still pumping) shows as Rug.

**The fix — two-tier evaluation:**

| Rug Signal Found On | New Treatment |
|---|---|
| **This token itself** (autopsy = rug, scam flag, LP pulled) | Hard `Rug` (red) — keep current behavior |
| **Different token by same dev** (history-only) | New `⚠ Dev History` (amber) — *still mesh-eligible* if peak ≥3x, with an audit note |
| **No rug pattern** | Promote to mesh as good actor |

So MAGA becomes `⚠ Dev History` (not blocked), still promotable, with a clickable explanation: *"Creator's prior token X rugged — but THIS token shows no rug signals (no LP pull, no autopsy flag, still trading)."*

**Mesh transparency in the row pop-up:**
- New **"Mesh Decision"** section on every drill-down showing the full reasoning chain:
  - Creator wallet (full + Solscan link)
  - Creator's prior history (tokens_rugged, trust_level, # of prior calls in insiders)
  - This token's own death signals (autopsy, LP, mcap)
  - Final decision + plain-English reason
- New **"Reconsider"** button (super-admin only) on rejected tokens — re-runs evaluation with current data.

### 4. Fix the "0m lifespan" mystery + explain "Promote ≥3x to Mesh"

**Lifespan = 0m cause:** Several historical milestones in `telegram_channel_calls` share the exact same `created_at` (bulk-import artifact). The builder uses `created_at` when `message_timestamp` is null, so milestones collapse to one timestamp.

**Fix:** Builder prefers `message_timestamp` always; when missing, derives lifespan from the *spread* of `created_at` only if more than 60 seconds apart. If all timestamps collapse, surface lifespan as `unknown` (not `0m`) with a tooltip: *"Original Telegram timestamps not preserved on this batch."*

**"Promote ≥3x to Mesh" — what it does (made visible in UI):**
Add an info button next to the button with this hover-card explanation:
> Scans every Insiders token with peak ≥3x. For each, looks up the creator wallet, checks for rug signals on **this specific token**, and if clean writes a `good_actor_creator` record into `reputation_mesh` (the global trust graph used by the bubble map, /dev report, and trading guards). Wallets with rug history on *other* tokens get an amber "Dev History" tag but stay eligible — only this-token rugs are hard-rejected.

## How tokens & devs enter the Mesh (your last question, in plain English)

```text
                    ┌─────────────────────────────────┐
                    │  reputation_mesh (the graph)    │
                    └────────────────▲────────────────┘
                                     │
   ┌─────────────────┬───────────────┼──────────────┬──────────────────┐
   │                 │               │              │                  │
universal-mesh-   insiders-mesh-  social-      allstar-          oracle-unified-
feeder (cron)    promoter        discovery    promotion         lookup
                 (this button)   -engine      -engine
   │                 │               │              │                  │
every analyzed   ≥3x insiders    Twitter/web   devs w/ ATH        every /dev or
token + dev      calls + clean   socials per   ≥$100k auto-       /holders runs
auto-indexed     dev history     token         flagged star       index dev+token
```

Five independent feeders all write into one table: `reputation_mesh`. Each row says *"source X has relationship Y with target Z, evidence = ..."*. The bubble map, trading guards, and Telegram bot all read from this single graph.

## Technical Details

**Files modified:**
- `src/components/admin/tabs/InsidersLifecycleTab.tsx` — new card, new filters, CSV export, mesh-decision section in drill-down, info button.
- `supabase/functions/insiders-mesh-promoter/index.ts` — split rug check into `thisTokenRug` vs `devHistoryRug`; only hard-reject on `thisTokenRug`; persist a structured `mesh_decision_trace` JSON.
- `supabase/functions/insiders-lifecycle-builder/index.ts` — prefer `message_timestamp`, fall back smartly, mark unknown lifespans as null (not 0).

**DB migration:**
- New nullable columns on `telegram_insider_token_lifecycle`:
  - `dev_history_warning boolean` (amber flag for prior-rug devs whose current token is clean)
  - `mesh_decision_trace jsonb` (full reasoning chain for the drill-down)
- One-shot UPDATE that re-classifies the ~14 existing `rejected_rug` rows: those whose current token has no own-token rug evidence get reclassified to `not_eligible` + `dev_history_warning=true`.
- Re-run the builder once after deploy to recompute lifespans for the bulk-imported batch.

**No breaking changes** — everything is additive. The CSV export uses native browser blob download (no new deps).

