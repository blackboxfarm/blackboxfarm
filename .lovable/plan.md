

# 🕸️ Mesh / Reputation / Blacklist Ecosystem — Systematic Audit

This is a **read-only audit report** (no code changes). It maps every function, cron, UI surface, and entry point that contributes to your internal **Blacklist / Whitelist** intelligence.

---

## 1. Where it lives in the UI

| Tab | Sub-tab | What it does |
|---|---|---|
| **Oracle** (main hub) | Master Spider | Manual deep investigations of dev/wallet/community |
| Oracle | Intel Lookup | Single-shot lookup of token/wallet/@handle |
| Oracle | X Communities | Manage 7,115 indexed X communities |
| Oracle | Team Intel | Wallet family clustering view |
| Oracle | **Mesh Pipeline** | Live mesh stats + manual scraper trigger |
| Oracle | Auto-Classifications | Feed of `oracle-auto-classifier` decisions |
| Oracle | Historical Backfill | Status of `oracle-historical-backfill` cron |
| Oracle | Mesh Viewer / Bubble Map | Visual graph of `reputation_mesh` |
| Oracle | Dev Intel Report | Genealogy + KYC root tree |
| Oracle | **Blacklist Mesh** | 54 entries today |
| Oracle | **Whitelist Mesh** | 2 entries today |
| Oracle | KYC Override | Manual KYC root assignment |
| HoldersIntel tab | (separate) | Reputation backfill panel, Social links backfill panel |
| BlackBox tab | Bundle Analysis | Wallet bundle reports (mesh-adjacent) |
| AllStar tab | (separate) | Allstar developer promotion / mint alerts |

**Yes — most lives under Oracle**, but the following mesh-touching surfaces live **outside** Oracle:
- `HoldersIntel tab → ReputationBackfillPanel + SocialLinksBackfillPanel`
- `AllStar tab → allstar_mint_alerts + promotion engine UI`
- `BlackBox tab → WalletBundleReport`
- `PumpfunMonitor tab → dev tracker`
- Per-token bubblemap (`/bubblemap?token=…`) writes to mesh on each render

---

## 2. Live database state (snapshot)

```text
reputation_mesh        424,263 links   (~2k–10k/day intake, healthy)
developer_profiles      58,627  rows   42k neutral / 16k scammer / 442 suspicious / 55 trusted
dev_wallet_reputation   60,584  rows   (legacy, parallel table — see gap #1)
token_social_links           0  rows   ⚠️ EMPTY — backfill never ran or schema mismatch
x_communities            7,115
token_lifecycle          3,454
token_fingerprints           0  ⚠️ EMPTY (scanner running every 30 min, writing nothing)
co_mint_clusters             0  ⚠️ EMPTY (detector running every 15 min, writing nothing)
pumpfun_blacklist           54  (34 dev_wallet, 15 token, 3 funder, 2 suspicious)
pumpfun_whitelist            2  (token_address only — no devs whitelisted)
```

---

## 3. Active cron jobs (mesh-related)

```text
*/5  min  backfill-x-communities-5min        ← X community spider
*/5  min  family-mint-monitor-p1-5min        ← Priority allstar mint monitor
*/5  min  harvest-token-socials-backfill     ← Social link harvester (writes 0 rows ⚠️)
*/10 min  backfill-genealogy-drip            ← KYC root tracing
*/10 min  family-discovery-engine-10min      ← Wallet family clustering
*/15 min  co-mint-cluster-detector-15min     ← Co-mint groups (writes 0 rows ⚠️)
*/15 min  family-mint-monitor-all-15min
*/15 min  oracle-auto-classifier-15min       ← Auto blacklist/whitelist verdicts
*/15 min  phanes-x-backfill
*/30 min  allstar-promotion-engine-30min
*/30 min  ath-24h-backfill-30min
*/30 min  dev-behavior-scorer-30min
*/30 min  oracle-historical-backfill
*/30 min  token-fingerprint-scanner-30min    ← Writes 0 rows ⚠️
0/h       developer-integrity-hourly
0/h       oracle-hourly-scan
0/h       refresh-mesh-summary-hourly
0 6 * * * developer-wallet-rescan-daily
0 */6     mesh-backfill-6h
```

---

## 4. Data inflow funnels (where mesh entries come from)

```text
                        ┌─ TG /holders, /dev, /bubble ──┐
                        │                                │
  Pump.fun new mints ───┤                                │
  DexScreener top 200 ──┤                                │
  Twitter scanner ──────┼──► token/wallet ingest ───────►│
  Helius webhooks ──────┤                                │  
  Manual Oracle lookup ─┤                                │
                        └────────────────────────────────┘
                                       │
                                       ▼
                  ┌──────── ENRICHMENT FAN-OUT ─────────┐
                  │                                      │
                  ▼                                      ▼
          oracle-master-spider              auto-genealogy (KYC root)
          social-mesh-linker                family-discovery-engine
          social-larp-detector              backfill-x-communities
          x-community-enricher              rug-event-processor
          rejection-mesh                    pumpfun-fantasy-sell-monitor
                  │                                      │
                  └────────────► reputation_mesh ◄───────┘
                                     │
                                     ▼
                  ┌──── CLASSIFIERS (auto verdicts) ────┐
                  │                                      │
                  ▼                                      ▼
          oracle-auto-classifier         developer-reputation-calculator
          dev-behavior-scorer            calculate-developer-integrity
                  │                                      │
                  └────► developer_profiles, pumpfun_blacklist/whitelist
```

---

## 5. What we're doing WELL ✅

1. **Mesh ingest is healthy** — 2k–10k new links/day, 424k total. The funnels are clearly wired and the spider/feeder/scanner network is comprehensive.
2. **Genealogy + KYC tracing works** — `auto-genealogy.ts` shared module fans out from every wallet investigation and writes KYC roots cleanly (27 KYC root rows).
3. **Developer profiling at scale** — 58k devs profiled with trust levels, hourly integrity recalc, daily wallet rescan.
4. **X community indexing** — 7,115 communities tracked, 5-min spider keeps it fresh.
5. **Multiple converging signals** — rug events, LARP detection, fantasy sell monitor, and rejection mesh all feed the same graph (good).
6. **Oracle UI is the right "single pane"** — all major investigation surfaces are clustered there.

---

## 6. What we're doing BADLY ⚠️

| # | Problem | Evidence | Severity |
|---|---|---|---|
| 1 | **Schema fragmentation** — two parallel reputation tables: `developer_profiles` (58k) and `dev_wallet_reputation` (60k). `reputation-backfill` exists *just* to copy one into the other. They drift. | Two tables, two writers, duplicate logic | HIGH |
| 2 | **`token_social_links` is empty (0 rows)** despite `social-links-backfill`, `harvest-token-socials` (cron every 5 min), `social-mesh-linker` all targeting it. Likely silent insert failure (violates Zero-Tolerance Silent Fails rule). | 0 rows, scheduler running | HIGH |
| 3 | **`token_fingerprints` empty (0 rows)** — `token-fingerprint-scanner-30min` cron is firing but writing nothing. | 0 rows, cron active | HIGH |
| 4 | **`co_mint_clusters` empty (0 rows)** — `co-mint-cluster-detector-15min` cron firing, no output. | 0 rows, cron active | HIGH |
| 5 | **Whitelist is essentially unused (2 rows, 0 devs)** — auto-classifier produces blacklist verdicts but rarely "green" verdicts. The `forceVerdict='green'` branch in `oracle-master-spider` exists but is rarely triggered. | 2 whitelist rows vs 54 blacklist | MEDIUM |
| 6 | **Mesh intake declining** — drops from 10k/day (Apr 8) to 800/day (Apr 19–20). Either scanners broke or rate limits hit. | Time-series above | MEDIUM |
| 7 | **No central "Mesh Health" dashboard** — you have to open 6 tabs to know what's running. Cron failures are silent. | UI structure | MEDIUM |
| 8 | **Blacklist is tiny (54 entries) for 16,056 "scammer"-graded devs** — auto-classifier's threshold for promoting `trust_level=scammer` → `pumpfun_blacklist` is too strict, or the promotion path isn't wired. | 54 vs 16k | MEDIUM |
| 9 | **Multiple insert paths swallow errors** — 9 functions write to `reputation_mesh` with `.then(r => if r.error console.warn(...))` instead of `assertInsert`. | grep results | MEDIUM |
| 10 | **No automated blacklist→trading-guard sync verification** — guards read the table, but no health check confirms freshness. | No monitor found | LOW |

---

## 7. Gaps (things missing entirely)

- **No "scammer → blacklist" promoter cron.** Devs marked `trust_level='scammer'` (16k of them) never automatically migrate to `pumpfun_blacklist`. This is the biggest missed opportunity.
- **No "trusted dev → whitelist" promoter** for the 55 trusted devs.
- **No mesh provenance audit** — given a blacklist entry, you can't easily answer "which scanner added this and why?"
- **No cross-channel deduplication** — a scammer wallet can appear in `pumpfun_blacklist` (by wallet), `developer_profiles` (as scammer), and `reputation_mesh` (as a node) without a shared ID.
- **No retention/archival** for `reputation_mesh` — it'll hit 1M rows soon at current rate, and storage policy memory says you're already optimizing space.
- **Telegram entry points (`/holders`, `/bubblemap`, `/dev`)** trigger genealogy/mesh writes, but there's no per-command counter showing "mesh links created from TG today" — hard to attribute growth.

---

## 8. Recommended next steps (ordered by impact)

1. **Fix the silent-fail trio** — diagnose why `token_social_links`, `token_fingerprints`, `co_mint_clusters` write 0 rows despite active crons. Likely RLS/schema/`assertInsert` missing.
2. **Build the scammer→blacklist promoter** — single cron that takes `developer_profiles` where `trust_level='scammer' AND total_tokens_created >= 3 AND rug_pull_count >= 2` and inserts into `pumpfun_blacklist`. This alone takes blacklist from 54 → ~3,000 quality entries.
3. **Build the trusted→whitelist promoter** — same pattern for the 55 trusted devs.
4. **Consolidate `dev_wallet_reputation` into `developer_profiles`** — make `reputation-backfill` a one-time migration, then drop the source table.
5. **Add a single "Mesh Operations Health" dashboard** under Oracle showing: cron last-run, rows inserted/hr per scanner, error counts, and a kill switch per scanner.
6. **Audit the 9 mesh writers for `assertInsert` compliance** (Zero-Tolerance memory rule).
7. **Add a `mesh_provenance` column** (or use existing `evidence`) to track which function created each link — required for debugging blacklist disputes.

---

## 9. TL;DR for your review

- Oracle tab IS the right home; nothing major is hiding elsewhere except `HoldersIntel → backfill panels`, `AllStar tab`, and per-token bubblemap writes.
- Intake is fine. **Conversion to actionable blacklist/whitelist is broken.** You're scoring 16k scammers but only blacklisting 54.
- 3 critical tables are empty despite active crons → silent insert failures.
- Two parallel reputation tables need to be merged.
- Whitelist is functionally non-existent and needs a promoter.

When you're ready, approve a follow-up plan and I'll implement items #1, #2, #3 first (the highest-leverage fixes).

