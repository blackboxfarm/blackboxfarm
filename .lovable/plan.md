
# Plan — Dev Reputation: Full Token-Lifecycle Scoring Engine (Solscan-Pro powered)

## Goal

Given any **token CA** or **dev wallet**, return a verdict that:
1. Lists every past token they launched
2. Grades each token across the full lifecycle (mint → bonding → graduation → post-grad → death/CTO)
3. Rolls those grades additively into a per-dev reputation across 5 dimensions: **Effort, Skill, Integrity, Sustain, Social**
4. Distinguishes *3 good launches* from *4 bad + 1 great*, *effort-but-no-traction* from *scammy*, *inexperience* from *expert/shark*
5. Uses **Solscan Pro v2.0** as the on-chain truth layer wherever possible (replacing Helius-heavy and HTML-scrape paths)

---

## Phase 0 — Solscan Pro Activation (PREREQUISITE)

The TODO-list item *"Solscan Pro API Migration & Expansion Plan"* is folded in as Phase 0 because every lifecycle probe below leans on it.

### 0a. Confirm key & lift the guards
- Verify `SOLSCAN_API_KEY` is a Pro v2.0 key
- Remove the `DISABLED — free tier key cannot access pro-api.solscan.io` early-returns in:
  - `_shared/solscan-api.ts` (`fetchTransactionFromSolscan` + `parseBuyFromSolscan` + `parseSellFromSolscan`)
  - `_shared/solscan-markets.ts` (`fetchSolscanMarkets`)
  - `_shared/solscan-intelligence.ts` (token meta, CEX labels, SOL transfer chain)
  - `_shared/solscan-free.ts` (`fetchSolscanFreeTokenMeta`)
- Update `_shared/provider-health.ts` from "auth-broken" to "rate-limit-aware"
- Promote `breadcrumbs-scanner` to `type: api, priority: 95`
- Activate `developer-wallet-tracer` as the primary tracer
- Re-enable Solscan as the second corroborating source in the `oracle-unified-lookup` funding-chain block
- Hybridise `_shared/auto-genealogy.ts` to use Solscan first, Helius fallback

### 0b. What Solscan Pro replaces/upgrades
| Old path | New path |
|---|---|
| HTML scraping for transfers | `/v2.0/account/transfer` |
| Multi-call Helius for tx detail | Single `/v2.0/transaction/detail` paged |
| Estimated fills | Pre-parsed `sol_bal_change` + `token_bal_change` (on-chain truth) |
| Whale-vs-LP guesswork | `/v2.0/token/markets` authoritative LP list |
| Public-tier token meta | Pro `/v2.0/token/meta` |
| Browserless DOM scraping | Native endpoint |

### 0c. New capabilities unlocked (drive Phase 2 factors)
- DeFi Activity Timelines (per wallet, per token)
- Portfolio Valuations
- CEX wallet labels (real, not heuristic)
- Token top-holder movement
- Real-time LP composition
- Cross-token wallet behaviour
- Mint/Freeze authority audit
- Forensic autopsy enrichment
- **~30–50 % Helius credit reduction** — frees budget for the new probes

### 0d. First-wave Pro-only features (ship before reputation engine consumes them)
1. **Portfolio chip** on Bubble Map nodes (#2)
2. **Mint/Freeze authority badge** on token header (#8)
3. **Provider-health rewrite** (#5)
4. **Forensic autopsy enrichment** in `token-autopsy` (#9)

Phase 0 is its own deployable unit; nothing in Phases 1–6 is started until Phase 0 smoke-tests green.

---

## Phase 1 — "Token of Worth" gate

Tokens qualify for full lifecycle scoring if **any**:
- Peak market cap ≥ $25k
- Lived ≥ 6 h with ≥ $5k liquidity
- Reached DexScreener top-200 even briefly
- Graduated from pump.fun bonding curve
- Has ≥ 1 verified social asset (X community, TG group, site)

Failing tokens get a lightweight `mint_only_score` so spam/effort patterns still register.

---

## Phase 2 — Scoring Matrix (5 dimensions, ~40 factors)

Each factor → `{ score: -100..+100, weight: 0..1, evidence: jsonb, present: bool }`. Absence ≠ failure (weaker negative than active malfeasance).

### A. Mint & Bonding (Solscan Pro = primary source)
- Dev pre-mint wallet age & funding source (Solscan transfer chain + KYC root)
- Bundle/sniper concentration block 0–5 (Solscan tx detail)
- Dev buy-then-sell during bonding (Solscan `sol_bal_change`)
- Bundled associative wallets — count, % held (`reputation_mesh` + Solscan portfolio)
- Bonding-curve volume profile (organic vs wash) — Solscan tx timeline
- Time to graduation / stall pattern
- Dev's own contribution to bonding volume

### B. Graduation & Raydium
- Graduated to Raydium (binary, big positive)
- Post-grad LP size & whether dev seeded it (`/v2.0/token/markets`)
- Liquidity locked? (verifiable on-chain)
- Mint authority revoked + Freeze authority (Solscan Pro authority audit)
- Burn events + mcap at burn + community reaction (new probe)
- Secondary LP managed by dev (Solscan markets list)

### C. Sustain / Effort (the big gap to fill)
- Peak mcap milestones ($100k / $200k / $500k / $1M / $5M)
- Hours in top-200 / top-50 / top-10
- **Buybacks** — dev wallet buying post-grad (Solscan DeFi activity timeline) → new `probe-buybacks`
- DexScreener boosts paid (50x, 100x, 500x) + ROI (`token_boost_history`)
- Paid ads / promo spend signals
- Pump.fun Live hosted? Frequency? → new `probe-pumpfun-profile-activity`
- X Spaces hosted (X API)
- **Token burns** + announcement + market reaction → new `probe-burns`

### D. Social Build & Maintenance
- Website live, age, depth (`autopsy-social-death-check`)
- Telegram channel: members, admins/mods, message velocity, sentiment (`autopsy-tg-deep-pull`)
- X Community: members, posts/day, sentiment polarity (`autopsy-community-sweep`)
- Discord server: members, channels, active mods (new probe)
- TikTok presence (deferred to Phase 2.5)
- Pump.fun profile activity (posts, replies)
- CTO handover detected vs dev-led-to-death
- Social asset survival post-death (zombie vs nuked)

### E. Wallet Behaviour / Mesh
- # associative wallets, classified (dev / promo / sniper-bundle / unknown) — Solscan + `reputation_mesh`
- Wallet-washer / hidden-whale / diamond-dev / spike-kill patterns (already in `dev_wallet_reputation`)
- Promo-wallet bundle: managed responsibly vs rugged (new — Solscan portfolio diff)
- KYC root reached + exchange identified (Solscan CEX labels — finally real, not heuristic)

---

## Phase 3 — Per-Token Scorecard

New table `token_lifecycle_scorecard`:
```text
token_mint (pk), dev_wallet, worth_gate_passed bool
phase_scores jsonb     -- mint_bonding, graduation, sustain, social, wallet
factor_scores jsonb    -- per-factor {score, weight, evidence, present}
composite_score, effort_score, skill_score,
integrity_score, sustain_score, social_score numeric
verdict text           -- expert | competent | inexperienced | sloppy | scammy | shark | abandoner | builder
verdict_confidence numeric
solscan_evidence_refs jsonb  -- tx signatures + endpoints used (audit trail)
scored_at timestamptz, scoring_version text
```

---

## Phase 4 — Roll-up: `dev_reputation_v2`

Parallel to legacy `dev_wallet_reputation` (don't break callers). Columns:
```text
wallet_address (pk), tokens_scored, tokens_of_worth
distribution jsonb        -- {expert:1, competent:2, sloppy:4, scammy:0}
career_arc jsonb          -- timeline of verdicts (learning vs regressing)
weighted_effort, weighted_skill, weighted_integrity,
weighted_sustain, weighted_social, composite numeric
archetype text            -- builder | grinder | sniper | rugger | shark | tourist
best_token_mint, worst_token_mint
peak_mcap_lifetime, total_buybacks_usd, total_boosts_usd
last_rolled_up_at timestamptz
```

Roll-up rule: **best 3 tokens weighted 1.0, rest 0.6** — 1 great + 4 bad ≠ 0 great + 5 mediocre, but the 4 bad still drag Integrity/Effort. Effort & Integrity roll across **all** tokens (can't hide spam behind one winner).

---

## Phase 5 — Edge Functions

Net-new (additive):
1. `lifecycle-scorecard-builder` — runs all factor probes for one mint, idempotent
2. `dev-reputation-rollup` — recomputes `dev_reputation_v2` from scorecards
3. `dev-verdict-resolver` — public input: token CA OR dev wallet → full launch history + grades + reputation impact
4. `probe-buybacks`, `probe-burns`, `probe-pumpfun-profile-activity`

Reuse: `autopsy-tx-timeline`, `autopsy-tg-deep-pull`, `autopsy-community-sweep`, `dev-behavior-scorer`, `calculate-developer-integrity`, plus all newly-activated Solscan Pro shared modules from Phase 0.

Cron: `lifecycle-scorecard-builder` runs nightly over `token_lifecycle` rows where `worth_gate_passed = true AND (scored_at IS NULL OR autopsy_at > scored_at)`. Rollup runs after each batch.

---

## Phase 6 — Verdict Surface UI

`/super-admin/dev-verdict` (new tab):
- Dev card: archetype, composite, 5-dimension radar
- Career-arc timeline (verdicts over time)
- Per-token table with the 5 sub-scores + click-through evidence drawer (links straight to the Solscan tx signatures stored in `solscan_evidence_refs`)
- Mesh wallet panel: linked wallets classified + CEX labels

Frontend is a thin read of `dev-verdict-resolver` — no business logic in React.

---

## What I need confirmed before building

1. **Phase 0 first** — confirm `SOLSCAN_API_KEY` is Pro v2.0 and you want me to lift the DISABLED guards before any reputation work begins. (If the key isn't Pro yet, Phase 0 stalls and Phases 1–6 lose ~60 % of their data fidelity.)
2. **Worth-gate thresholds** — proposed $25k peak / 6 h+$5k liq / top-200 / graduated / 1 social. Tighter or looser?
3. **Roll-up weighting** — "best-3 at 1.0, rest at 0.6", or strict average, or "carry only the 5 best"?
4. **New probes scope** — confirm `probe-buybacks`, `probe-burns`, `probe-pumpfun-profile-activity` ship in this pass; defer Discord/TikTok to a follow-up?

After "approve" I'll execute Phase 0 → smoke-test → then schema + resolver + builder in one pass, then probes + UI.
