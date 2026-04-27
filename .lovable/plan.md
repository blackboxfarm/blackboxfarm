## Confidence Audit: $HENRY / Dev Wallet `7L3pwH…Gnaw`

**Short answer: ~30% of what the UI is showing for this token is wrong.** Two distinct false-positive sources are bleeding into the bubblemap. Neither is a topology bug — both are *upstream data-quality* bugs in two specific edge functions. Below is what's real, what's noise, and a tight fix.

---

### What is actually correct ✅

1. **The dev wallet itself** (`7L3pwHJLSep5n2MmfKty4aWjBjqivpGVoRY2HNXMGnaw`) — real, came from the Pump.fun creator field via the unified creator resolver. Confidence: high.
2. **The 3 `created_token` edges in `reputation_mesh`** at confidence 95:
   - `98onUX1k…pump`
   - `GtFhWYuu…pump`
   - `4QYFpHD5…pump`
   These were written by the canonical resolver after Pump.fun confirmed the creator. Plus the active token `CJUrEND…pump` itself = **4 real mints by this dev**, not 20+.
   
   Note: `token_lifecycle.creator_wallet` is `NULL` for the searched token — that's a separate gap (the watchlist row had it but it never got copied across).

3. **Funding chain hops** (`directly_funded` / `indirectly_funded`) — these come from `wallet-genealogy-scanner` which uses Helius transaction data. Those are on-chain truths.

---

### What is wrong ❌ — two distinct bugs

#### Bug 1 — "Wide Funder" `AxiomR…TTSk` (143 siblings) is the Axiom.trade router

The wallet `AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk` is the public **Axiom.trade swap/router** wallet. It funds gas for hundreds of unrelated traders. So *every* token in that "Top Sibling Tokens" panel ($ASTROID, $ODAI, $AIB, $CHUDHOUSE, $MIM, $uponly, $EVERYTHING, $BOY, +135 more) has **zero real connection** to the $HENRY dev — they just all happen to have used Axiom at some point.

**Why it slipped through `mesh-shared-funders`:**
- `NOISE_FANOUT_CAP = 150` in `supabase/functions/mesh-shared-funders/index.ts`
- AxiomR has 144 children → just under the cap → ranked as "Wide Funder" instead of being dropped as noise.
- We don't have Axiom in `_shared/cex-wallets.ts` as a known infra wallet, so `isCexWallet()` returns `false`.

#### Bug 2 — The "Pollen Robotics / HuggingFace" GitHub contributors

The `social_account_of` edges binding this dev wallet to:
- `pierre-rouanet`, `FabienDanieau`, `RemiFabre`, `apirrone`, `andimarafioti`, `matthieu-lapeyre`, `pollen-robotics/reachy_mini`, `askuric`, `cdussieux`, `augustin-crampette`, `alozowski`, `tfrere`, `haixuanTao`, plus discord IDs `2bAhWfXme9`, `Y7FgMqHsub`, x_account `nvidiaworkstatn`

…are all real humans / repos in the open-source robotics community. They got pulled in because `social-mesh-linker` scraped the token's website (probably a "Henry the Robot" themed page) and wrote **every link found on the page** as a `social_account_of` the dev wallet at confidence 60.

The function (lines 437–458) does:
```ts
const extraSocials = await discoverSocialsFromWebsite(website_url.trim());
for (const social of extraSocials) {
  meshLinks.push({ source_type: social.type, source_id: social.id,
    linked_type: "wallet", linked_id: creator_wallet,
    relationship: "social_account_of", confidence: 60, ... });
}
```

It treats *any* GitHub username found on the site as the dev's identity. So a memecoin website that quotes/credits the open-source project it stole the theme from will absorb the entire contributor list of that repo into the dev's identity graph.

---

### Proposed Fix (Phase-A — surgical, no schema change)

**1. Block the Axiom router (and add a real noise list).** Edit `supabase/functions/_shared/cex-wallets.ts` to add a new category `INFRA_WALLETS` (Axiom, Photon, BullX, Trojan, BONKbot, Maestro, Banana Gun, Phantom MoonPay, Jupiter aggregator, etc.). Update `mesh-shared-funders/index.ts`:
   - Treat `INFRA_WALLETS` like CEX terminuses (don't walk past, don't surface as "shared funder").
   - Lower `NOISE_FANOUT_CAP` from 150 → **40** (real dev families almost never fund >40 distinct creators; anything bigger is router/CEX noise).
   - Add UI label `infra_router` (red) so if one *does* surface, it's marked as "ignore".

**2. Stop GitHub-repo scraping from poisoning the identity graph.** In `supabase/functions/social-mesh-linker/index.ts` (the website-scrape block, lines 435–462):
   - **Drop confidence to 25** (below the UI's display threshold of ~50) for any social found via `discoverSocialsFromWebsite` — these are *associations*, not *ownership*.
   - **Skip GitHub `org/repo` paths entirely** (paths containing `/`) — those are project pages, never personal identities.
   - **Cap at 3 socials per website**. If a page has more than 3 distinct GitHub/Discord/Twitch handles, don't write any of them — it's a credits page or contributor list, not the dev's identity.
   - Add a `relationship` distinction: `mentioned_on_site` (weak, for context) vs `social_account_of` (strong, ownership). Only the former is allowed from website scraping.

**3. Backfill cleanup (one-shot SQL migration):**
   - Delete existing `social_account_of` edges where `evidence->>'source' = 'website_scrape'` AND `confidence < 70`.
   - Delete `reputation_mesh` rows where `source_id` ∈ new `INFRA_WALLETS` set.
   - Mark affected `dev_wallet_reputation` rows as needing a re-scan (clear their `twitter_accounts`/`github`/`discord_servers` arrays of the demoted handles).

**4. Plug the `token_lifecycle.creator_wallet` NULL.** In the unified creator resolver (`_shared/creator-resolver.ts`), after a successful Pump.fun resolution, also `update token_lifecycle set creator_wallet = ...` for the mint. This is a one-line write that prevents the "tokens minted = 0" gap I found.

**5. Add a UI "evidence chip"** on the bubble map dev/sibling cards: tiny badge showing the discovery source (`pump.fun-direct`, `helius-funding`, `website-scrape`, `infra-noise`) so users (and we, debugging) can immediately see *why* a node is connected. If the only evidence is `website-scrape`, mark it amber.

---

### Files to be edited

- `supabase/functions/_shared/cex-wallets.ts` — add `INFRA_WALLETS` set with Axiom/Photon/BullX/etc., export `isInfraWallet()`.
- `supabase/functions/mesh-shared-funders/index.ts` — apply infra filter, lower fanout cap, expose `cluster_label: 'infra_router'`.
- `supabase/functions/social-mesh-linker/index.ts` — gut the website-scrape ownership writes (lines 435–462): demote confidence, skip repo paths, cap at 3, switch relationship to `mentioned_on_site`.
- `supabase/functions/_shared/creator-resolver.ts` — backfill `token_lifecycle.creator_wallet` on successful resolution.
- New migration `supabase/migrations/<ts>_mesh_falsepos_cleanup.sql` — delete poisoned rows, refresh impacted dev rep rows.
- `src/components/bubble-map/SharedFundersPanel.tsx` — render `infra_router` label as red/de-emphasized; show evidence-source chip per sibling row.

### Out of scope (for a follow-up Phase B)
- Building a proper "infra wallet auto-detector" cron (any wallet that funds >100 *distinct* creators in 30 days → auto-flag as `infra_suspect`, surface in admin for review).
- Reverse-checking GitHub commits (does the GitHub user have a wallet on-chain that touched this dev?) before allowing the link at all.

---

**Bottom line for $HENRY specifically:** the dev minted ~4 tokens (not 20+), has no proven Pollen Robotics / HuggingFace identity, and the AxiomR cluster is meaningless. The bubble map is *honest about its evidence* (low-confidence chips visible in the diagnostics box: "12 new mesh connections uncovered" with no KYC root) but the UI elevates these signals more than it should. Phase A fixes that without touching topology.