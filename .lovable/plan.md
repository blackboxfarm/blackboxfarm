# Recycled X Community Detection — Final Plan

## Pattern recap
Serial ruggers re-skin one X Community across many launches to inherit member counts. Signals: community age >> token age, multiple prior names, member count >> holder count, prior linked mints mostly dead, admin handle = known serial dev.

## Scoring rules

```text
Signal                           Threshold              Score
─────────────────────────────────────────────────────────────
community_age_vs_mint_gap        > 30 days              +15
                                 > 90 days              +25
                                 > 180 days             +40
name_history_count               >= 2 prior names       +20
                                 >= 4 prior names       +35
member_count_vs_holders_ratio    members > 3× holders   +15
                                 members > 10× holders  +25
prior_linked_mints_dead_rate     >50% rugged/dead       +20
                                 >80% rugged/dead       +35
admin_handle_serial_dev          admin = creator of
                                 ≥2 prior failed mints  +30
rename_frequency                 ≥1 rename per 30d      +15
```

Sum capped at 100 → `recycled_community_score`. Bands:
- 0-24 clean
- 25-49 ⚠ suspicious (warn)
- 50-74 🟠 likely recycled (warn)
- 75+ 🔴 confirmed recycle (warn — never block)

Per your decisions: **warn only**, never auto-blacklist. Anyone can remake a community, but these actors don't because the bloated member count is the asset.

## Tier gating (Pro-only)
Score is **paid-subscriber gated**:
- Anon / free / auth: see a locked teaser badge "🔒 Recycled Community Score — Pro" with a one-line explanation and an upgrade CTA. No numeric score, no signal breakdown.
- `x_subscriber` / `pro` / `dev` / `enterprise`: full score, band, and signal-by-signal breakdown.
- Edge function returns the full payload only when caller's tier ≥ `x_subscriber`; otherwise returns `{ locked: true, tier_required: 'pro' }`.
- This is consistent with `useUserTier` / `PremiumFeatureGate` patterns already in the codebase.

## DB additions (one migration)
- Add to `x_communities`: `recycled_score int`, `recycled_band text`, `recycled_signals jsonb`, `recycled_evaluated_at timestamptz`.
- View `v_community_token_outcomes` — per community, aggregate linked mints' outcomes (peak mcap, rugged flag, age) from `developer_tokens` + `pumpfun_watchlist`.
- View `v_community_admin_dev_link` — joins `admin_usernames` against `developer_profiles.x_handle` to surface "this admin is a serial dev with N prior failures".
- RLS: `x_communities` already admin-readable; the score columns inherit. The edge function enforces tier gating before returning the JSON, not RLS.

## New edge function `community-recycled-scorer`
- Modes: `evaluate` (server-internal, no auth) and `read` (frontend, JWT required, tier-gated).
- `evaluate(community_id)`: pulls community + its currently-linked fresh token, computes the 6 signals via `_shared/community-rules.ts`, writes `recycled_score / band / signals / evaluated_at` back to row. No PII returned.
- `read(community_id)`: validates JWT, looks up tier via `web_user_subscriptions` (mirroring `useUserTier`), returns:
  - locked stub for free/auth users
  - full payload for x_subscriber+
- Cron `*/10 * * * *`: re-evaluates communities touched in the last 24 h (only when a new mint binds, matching your "don't check all the time" rule).

## Mesh impact
When `recycled_band ∈ {likely, confirmed}` AND community is linked to a fresh token:
- Insert `reputation_mesh` link `token → community` with `relationship='recycled_community_vehicle'`, confidence = score.
- When admin handle resolves to a known dev wallet, insert `admin_handle → token` with `relationship='serial_rug_operator'`.
- Add a strike to `dev_wallet_reputation` for that wallet.
- All entries respect existing fail-open policy — they tag, never block.

## UI surfaces
All gated through a small `<RecycledCommunityBadge>` component:
- **Pro**: 🔴/🟠/⚠/🟢 chip + hover popover with the 6 signal rows.
- **Non-Pro**: dimmed 🔒 chip with tooltip "Recycled Community Score — Pro feature" + upgrade CTA.

Placements:
- `MasterDBTab.tsx` — new column next to X Communities.
- `TeamIntelDashboard.tsx` — inline on each community row.
- `BubbleMap` — community node ring color follows band; non-Pro see only neutral ring + lock icon on hover.

## Files
- `supabase/migrations/<ts>_recycled_community_scoring.sql` — columns + 2 views.
- `supabase/functions/community-recycled-scorer/index.ts` — new (evaluate + read modes, tier gating).
- `supabase/functions/_shared/community-rules.ts` — pure rule fn, unit-testable.
- `src/components/admin/RecycledCommunityBadge.tsx` — new (Pro vs locked variant).
- `src/components/admin/tabs/MasterDBTab.tsx` — add column.
- `src/components/admin/oracle/TeamIntelDashboard.tsx` — inline badge.
- `src/components/bubble-map/*` — community node ring tinting (small touch).
- pg_cron: `community-recycled-scorer-10m`.

## Out of scope
- Periodic re-scrapes of every X Community (we re-evaluate only when a new mint binds).
- Auto-blacklist or bot-block of admin handles (warn-only per your call).
- Deleting or sanitizing existing rows.

## Memory updates after build
- `mem://features/intelligence/recycled-community-detection` — rule set, bands, gating policy.
- Add Core line: "Recycled Community Score is Pro-gated; free tiers see locked teaser only."
