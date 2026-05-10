
# Team Intel Dashboard — Feedback & Fix Plan

Direct answers to your questions first, then the fix list.

## Answers to your questions

**"Unkown" badge on the right side of every team**
That is the team's `risk_level` field rendered by `getRiskBadge()`. Every row in `dev_teams` currently has `risk_level = 'unknown'` because the team risk classifier hasn't tagged them yet. It is not telling you anything useful right now — it is just the absence of a verdict. Fix: relabel to "Unrated" with a tooltip ("Auto-classifier hasn't scored this team yet"), so it stops looking like a label for the team itself.

**Risk Score 990 (Rotation Patterns)**
That column is NOT a 0–100 score — the Postgres function `get_rotation_patterns` computes:

```
risk_score = admin_count × 30 + mod_count × 20 + min(co_mod_count, 20) × 5
```

`@estoni_x` is admin of 33 communities → 33 × 30 = **990**. There is no upper bound. The `<Progress value={risk_score}/>` bar is wrong because Progress expects 0–100. Fix: rename to "Rotation Score", show the raw number with a tooltip explaining the formula, and replace the progress bar with a normalized bar (`min(score / 1000, 1) × 100`) plus a colored band (≥300 high, ≥150 medium).

**Mesh Link Distribution showing exactly 50 / 1000 / 0 / 0 / 0**
Those numbers are wrong, and here is why:

- The materialized view `mesh_summary` was last refreshed **2026-02-09** (3 months ago), and at that time admin/mod/co_mod/community_for were all zero. Real current counts in `reputation_mesh`:
  - admin_of: **1,206**
  - mod_of: **498**
  - co_mod: **1,010**
  - community_for: **22,032**
- When the front-end falls back to a direct query, the Supabase JS client caps at **1000 rows by default** — that is exactly where the "1000" comes from. All 1000 rows happened to be one relationship type, so the other categories show 0.
- "50 Teams" / "50 Rotators" are page-size caps (`PAGE_SIZE = 50`) being shown as totals. Also misleading.
- "0 Rugged" / "0 High Risk" are genuine — `tokens_rugged` and `risk_level` aren't being populated by any classifier yet.

Fix: refresh & schedule the materialized view, drop the broken fallback, and make the top stat cards report real DB totals (count queries with `head: true, count: 'exact'`) instead of array lengths.

## Scope of edits

All in `src/components/admin/oracle/TeamIntelDashboard.tsx` plus one DB migration.

### 1. Linked Communities → real X community links
Today: `<Badge>#{comm.slice(0,10)}...</Badge>` with no link.
Change to anchor: `https://x.com/i/communities/{comm}` (these IDs like `2023816834667987005` are X community IDs), open in new tab, ExternalLink icon.

### 2. Linked Tokens → ticker as label, working URL, hide dead ones
Today: shows mint prefix, links to `dexscreener.com/solana/{mint}` (many 404).
Change:
- Fetch ticker for each mint in the visible team panel from `token_lifecycle` / `scraped_tokens` / `pumpfun_watchlist` (one batched `select symbol, mint where mint in (…)`), cache per team expansion.
- Render `${symbol}` as the badge label; mint as title hover.
- Link priority:
  1. If the token has a DexScreener pair → `dexscreener.com/solana/{mint}`.
  2. Else → `pump.fun/coin/{mint}` (covers pre-graduation tokens that have no DEX page).
- Tokens with no symbol AND no on-chain presence get a muted "dead" pill, not a broken link.

### 3. Member Wallets → full address + clickable + owner label
Today: `Aaaa…Bbbb` truncated, only the icon is the link, no owner info.
Change each wallet row to:
- Full base58 address rendered with `font-mono text-xs break-all`, the **whole address is the anchor** (`solscan.io/account/{wallet}`), copy button next to it.
- Owner label resolved with a single batched lookup (one query per team expand) across, in priority:
  1. `developer_profiles.master_wallet_address` → "Dev: @{primary_x_handle}" (or wallet alias).
  2. `cex_wallets` / `is_kyc_root` → "CEX: {exchange_name}" or "KYC root".
  3. `wallet_labels` (if present) → label.
  4. Otherwise → "Unlinked" (italic, muted) — never the word "Unknown" (which we are reserving for risk).
- Show owner label as a small secondary line under the wallet, NOT as a guess.

### 4. Top stat cards → real numbers, not page-size caps
Replace the four misleading numerics:
- Teams: `select count(*) from dev_teams where is_active`.
- Tokens: `select sum(tokens_created) from dev_teams where is_active` (single aggregate query) — drop the `teams.reduce(...)` over the visible 50.
- Rotators: `select count(*) from get_rotation_patterns(2, 2147483647, 0)` OR a new RPC `count_rotation_patterns(min_communities)`.
- Mesh Links: `select total_links from mesh_summary` after refresh.

### 5. Mesh Link Distribution → repair `mesh_summary`
DB migration:
```
REFRESH MATERIALIZED VIEW CONCURRENTLY mesh_summary;
```
Plus a pg_cron schedule (every 15 min) so it stays current. Drop the 1000-row fallback in the front-end (it is the source of the fake "1000 / 0 / 0 / 0" pattern); show "Computing…" spinner while the view is refreshing for the first time.

### 6. Risk badge wording on team rows
`getRiskBadge('unknown')` → render as "Unrated" with a `title` tooltip "Auto-classifier hasn't scored this team yet". Keeps the column honest until the classifier exists.

### 7. Rotation Patterns Risk Score column
- Rename header to "Rotation Score".
- Add a `<TooltipProvider>` info icon next to the header explaining: `admin × 30 + mod × 20 + min(co_mod, 20) × 5`.
- Progress bar value: `Math.min(risk_score / 1000, 1) × 100`.
- Color thresholds: ≥300 destructive, ≥150 orange, else muted.

### 8. X Accounts & Mods (already partially OK)
Wrap each `@admin` / `@mod` / `@member` badge in `<a href={`https://x.com/${handle}`} target="_blank">`. The Rotation Patterns table already does this — apply the same pattern to the team-detail panel.

## Out of scope (call out, don't fix here)
- Populating `tokens_rugged` and `risk_level` requires a classifier job — separate task, not part of this UI pass.
- Adding wallet-label coverage beyond what already exists in `developer_profiles` / `cex_wallets` is also a separate backfill task.

## Technical notes
- Mint→ticker batching: one `.in('mint', [...])` per expanded team, results stored in a `Map<mint, { symbol, has_pair }>` in component state, keyed by team id so collapsing/re-expanding doesn't re-fetch.
- Wallet→owner batching: same pattern using `developer_profiles` and `cex_wallets`.
- `mesh_summary` refresh migration must use `CONCURRENTLY` (the view already has a unique index? — verify; if not, add one before scheduling).
