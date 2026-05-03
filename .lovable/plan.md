## Goal

Tighten the BlackBox Autopsy report based on the $HIGHER read-through. Five fixes, one pass.

---

## 1. Lifetime — render as days + hours

**Problem:** "315.76 hours" is unreadable.

**Fix:** In `autopsy-writer/index.ts` build a `formatLifetime(ageHours)` helper and use it in both:
- the Subject table line passed to the LLM (so the model echoes the same string)
- a new explicit `Lifetime (display): 13d 3h` row in the user prompt that the LLM is told to copy verbatim

Format rules:
- `< 1h` → `Xm`
- `< 24h` → `Xh Ym`
- `≥ 24h` → `Xd Yh` (e.g. `13d 4h`)

Also update the few-shot examples to use the new format so the model doesn't drift back to decimal hours.

---

## 2. Time of Death — relative + absolute

**Problem:** Currently shows raw ISO `2026-04-28T17:49:43+00:00`.

**Fix:** Render as:

```
2 days ago (2026-04-28 17:49:43 UTC)
```

Add `formatTimeOfDeath(iso)` helper that emits `<relative> (<absolute UTC>)`. Relative buckets: `Xm ago`, `Xh ago`, `Xd ago`. Pass the formatted string into the prompt and pin the model to use it verbatim in the `🪦 Time of Death` row.

---

## 3. Discovery Snapshot — hyperlink the labels

**Problem:** Today the legend is plain text. We have the addresses/URLs in scope, so each row label should deep-link out.

**Fix:** Change `discoveryLegend` from a markdown table to a markdown table where the **left column is a markdown link** when the underlying datum exists. Targets:

| Row | Link target |
|---|---|
| Mint Data | `https://solscan.io/token/<mint>` |
| Dev Wallet | `https://solscan.io/account/<creatorWallet>` |
| KYC Account (cluster root) | `https://solscan.io/account/<kycRoot>` |
| Pump.fun Profile | `https://pump.fun/profile/<creatorWallet>` |
| X Community | community URL from `token_social_links` (or `https://x.com/i/communities/<id>`) |
| WWW | the website URL |
| Telegram | `https://t.me/<handle>` |
| Discord | invite URL |
| TikTok | profile URL |
| DexScreener Paid | `https://dexscreener.com/solana/<mint>` (always linkable) |
| DexScreener Boosts | same DexScreener pair URL |

For ❌ rows we still link the label where a canonical lookup URL exists (Mint, Dev Wallet, DexScreener) so the analyst can verify the negative themselves. Status icon ✅/❌ stays in the right column.

`ArticleMarkdownRenderer` already renders markdown links — no UI change needed.

---

## 4. Death-cause classifier — "abandoned vs organic" disambiguation

**Problem:** $HIGHER got tagged organic, but the user's read is "dev built it, dev shipped it, then walked when it started to fade." That's `negligent` (dev abandonment), not `organic_death`.

**Fix in `_shared/autopsy-taxonomy.ts` (classifier):** add a tiebreaker between `organic` and `negligent`:

- If social_completeness ≥ 3 **AND** there exists a clear admin-silence window (`social_no_admin_hours ≥ 24`) **before** mcap fell ≥ 70% from ATH → classify as `negligent` (dev walked), NOT organic.
- If admin was responsive through the decline → keep as `organic` (real cycle).
- If `txEvidence.dev_final_action_at` precedes the dump cascade by hours and dev never returned → tilt to `negligent`.

Also add to the LLM prompt for `negligent` intent:

> "Frame this as: the dev built and shipped, but went silent during the decline. Do NOT call this organic if mod activity stopped before holders rotated out."

This addresses the user's exact concern: the dev's *inaction during the fade* is the failure, not the build.

---

## 5. Fill the DexScreener Boosts gap when "Paid = ✅, Boosts = ❌"

**Problem:** $HIGHER shows `DexScreener Paid ✅` but `DexScreener Boosts ❌`. Paid implies boosts were almost certainly purchased — we just never polled them.

**Fix:** In `autopsy-writer`, after `enrichCandidate` returns, detect the gap:

```text
hasDexPaid && !hasDexBoosts && boostTimeline.length === 0
```

When detected, on-demand call DexScreener boosts API for that mint:
- `GET https://api.dexscreener.com/token-boosts/latest/v1/<chain>/<mint>`
- `GET https://api.dexscreener.com/token-boosts/top/v1/<chain>/<mint>`

Insert any results into `token_boost_history` (so future reads use the cache, per the dex-screener-data-pipeline memory) then re-run `enrichCandidate` to pick them up before the prompt is built.

If still empty after the live call, footnote the row: "DexScreener paid order recorded but no boost-spend captured — boost API returned empty."

---

## Files touched

- `supabase/functions/autopsy-writer/index.ts` — formatters, hyperlinked legend, gap-fill call, prompt updates, few-shot updates
- `supabase/functions/_shared/autopsy-enrich.ts` — small helper to ingest live boost API result
- `supabase/functions/_shared/autopsy-taxonomy.ts` — organic/negligent tiebreaker
- (no UI changes — `ArticleMarkdownRenderer` already handles links)

## Out of scope

- Re-running every existing draft. After deploy, the user clicks **Re-Generate** on the $HIGHER and $MCUNC drafts to validate. New autopsies pick it up automatically.
