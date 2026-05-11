## KYC Coverage Expansion — Approved Build (no Arkham)

### Goal
Lift KYC-verified dev wallets from current 94/62,795 (0.15%) toward a meaningful number using only the providers we already pay for: **Helius, Solscan, Birdeye, our own label DB**.

### Why current coverage is so low
- BFS only marks `kyc_verified=true` when the chain terminates at a known **CEX** label.
- Most Solana dev wallets are funded by **bridges, on-ramps, aggregators, MM desks** — these are KYC-origin in the real world but our model treats them as "unverified".
- BFS hops only call Helius `funded-by`; per-hop Solscan label lookup runs only at depth-0.

### Build steps

**1. Schema — broaden the KYC label model**
- Migration: add `entity_type text` to `known_cex_wallets` (values: `cex | bridge | onramp | aggregator | mm_desk | custodian`). Default existing rows to `cex`.
- Migration: add `kyc_source_type text` to `developer_profiles` (`cex | bridge | onramp | aggregator | mm_desk | unknown`).
- Migration: add `kyc_trail_status text` to `developer_profiles` (`verified | trail_no_kyc | trail_incomplete | not_attempted`) so UI can stop conflating "couldn't trace" with "self-custody".

**2. Seed bridge / on-ramp / aggregator deposit wallets**
- New migration seeding ~30–50 well-known Solana addresses for: Wormhole, deBridge, Allbridge, Mayan, MoonPay, Transak, Phantom on-ramp, Coinbase Pay, Jupiter aggregator referral wallets, Kamino/Drift custody, Squads multisig deployer.
- Each row: `entity_type` set appropriately; `cex_name` is human label.

**3. `_shared/cex-wallets-db.ts` — return entity type**
- Extend `getCexNameCached/Any` to also return `entity_type`. New helper `getEntityCached(addr): { name, type } | null`.
- `recordCexWallet()` accepts `entityType` param (default `cex`).

**4. `mesh-kyc-deep-search` — per-hop Solscan label + broadened terminator**
- In BFS hop loop, after each Helius `funded-by` resolves a funder, immediately call `solscanCheckAccountLabel(funder)` and consult local dict. Match on **any** `entity_type` not just CEX.
- On match: write `kyc_verified=true`, `kyc_source_type=<entity_type>`, `kyc_source=<provider>:<label>`, `kyc_trail_status='verified'`.
- If BFS exhausts depth without a hit: set `kyc_trail_status='trail_no_kyc'` (terminal wallet looks self-custody) or `'trail_incomplete'` (depth limit hit, funder still resolving).

**5. Rescan helper — apply the expanded dictionary**
- Extend existing `insiders-genealogy-rescan-kyc` pattern to a new function `kyc-rescan-master-dict` that walks `developer_profiles` where `kyc_verified=false AND genealogy_chain IS NOT NULL`, re-checks every hop against the now-broader dictionary, and flips rows without any new API calls. One-shot + cron every 6 h.

**6. UI — `DevKycCoveragePanel` 3-state breakdown**
- Replace single "KYC root traced" bar with stacked: `Verified KYC (CEX/Bridge/Onramp split) | Trail no KYC | Trail incomplete | Not attempted`.
- Add small legend showing per-`entity_type` counts.

**7. Memory updates**
- Update `mem://features/oracle/kyc-fast-path-and-self-expanding-dictionary.md`: dictionary now multi-entity-type, terminator broadened, per-hop Solscan label in BFS.
- Add `mem://features/oracle/kyc-trail-status-model.md`: 4-state model + entity types.

### Out of scope
- Arkham / TRM / Chainalysis (cost rejected).
- Birdeye for KYC (no relevant endpoint).

### Expected lift
After steps 1–5 ship, the rescan pass alone should reclassify a large share of the 62,701 currently-unverified rows because most chains do touch a bridge or on-ramp within 5 hops. Realistic target: **15–35% verified coverage** post-rescan, with the remainder honestly bucketed as `trail_no_kyc` / `trail_incomplete` instead of false-zero.

### Order of execution
1. Migrations (schema + bridge seed)
2. `cex-wallets-db.ts` entity_type plumbing
3. `mesh-kyc-deep-search` per-hop label + broadened terminator
4. `kyc-rescan-master-dict` function + cron
5. `DevKycCoveragePanel` 3-state UI
6. Memory file updates
