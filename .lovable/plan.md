# Creator Profile = Fused Identity, Queryable by Any Signal

## What "Creator" actually means (the rule)

A **Creator Profile** is **one identity** that fuses every signal we've ever seen tied to the same person:

- **Wallets**: dev/mint wallet + sister wallets + KYC root (exchange deposit)
- **Socials**: X handle(s) (by immutable numeric ID, not @-name), Telegram user ID(s), Discord ID(s), website domain(s)
- **Tokens**: every mint we've attributed to any of the above

Any one of those signals is a **valid query key**. Drop a TG user ID into the mesh search → it resolves to the same Creator Profile as the dev wallet → you instantly see every token, every alias, every prior rug or win.

The profile **grows organically**. New token from an unknown dev wallet + unknown KYC, but its X handle matches one we've seen → the new wallet + new KYC get **fused into the existing profile** automatically. No manual merge.

## Why this works on what we already have

We don't need a sprawling new schema. The pieces exist:

- `developer_profiles` — master_wallet + KYC fields + twitter/telegram/discord handles + reputation
- `developer_wallets` — sister wallets linked to a developer_id
- `developer_genealogy` — KYC root + funding chain
- `co_mint_clusters` — wallet groupings by mint behavior
- `x_account_registry` — immutable X user IDs with handle-rotation history
- `reputation_mesh` — generic typed edges (source_type/source_id → linked_type/linked_id)

What's missing is a **single fusion key** + a tiny **alias table** so a TG ID or Discord ID can resolve back to a `developer_profiles.id`.

## The plan

### 1. `creator_identity_aliases` (one new small table)

Glue table — every non-wallet signal points back to a `developer_profiles.id`:

```text
creator_identity_aliases
├── creator_id           uuid → developer_profiles.id
├── alias_kind           enum: 'wallet' | 'kyc_root' | 'x_user_id' | 'x_handle'
│                            | 'telegram_user_id' | 'telegram_handle'
│                            | 'discord_id' | 'discord_handle' | 'website_domain'
├── alias_value          text (lowercased, normalized)
├── confidence           int  (0–100)
├── source               text (which edge function attributed it)
├── first_seen_at / last_seen_at
└── UNIQUE (alias_kind, alias_value)   ← any signal resolves to exactly ONE creator
```

The `UNIQUE` constraint is the whole trick: when a new token's X handle matches an existing alias row, we already know which `creator_id` to attach the new wallet/KYC to. Fusion happens at write time, not query time.

### 2. `creator-profile-fuser` edge function (the brain)

Runs on every new token discovery (called from existing genealogy/social pipelines, no new cron). For each new token it gathers all signals it can find:

```text
inputs collected for new token:
  dev_wallet, kyc_root, x_handle (→ x_user_id via registry),
  telegram_user_id, discord_id, website_domain, sister_wallets

resolution:
  for each signal, check creator_identity_aliases:
    - if it resolves to creator_id X → reuse X
    - if multiple signals resolve to DIFFERENT creators → MERGE (lowest id wins,
      record merge in creator_merge_log)
    - if no signal resolves → create new developer_profiles row, use that id
  upsert every signal as an alias row pointing to the chosen creator_id
```

This is the organic growth: a base dev launching secretly under a fresh wallet but reusing his X handle gets **automatically fused** to his prior identity.

### 3. Mesh query: any signal → Creator Profile

A single read endpoint `creator-profile-lookup` accepts:

```text
{ query: "0xWallet..." }   or
{ query: "@somehandle" }   or
{ query: "tg:123456789" }  or
{ query: "discord:abc#1234" }
```

It normalizes, hits `creator_identity_aliases`, and returns the full fused profile:

- All wallets (dev, sister, KYC root) with roles
- All socials (X with rotation history, TG, Discord, website)
- All tokens with peak_multiplier / is_rugged / mesh_promotion_status
- Aggregate verdict (green / red / mixed) + counts
- Merge history (so you can see "this profile absorbed 2 prior identities")

### 4. UI: replace the misleading "319 creators • 0 KYC roots" header

The current Wallet Cross-Links panel in `InsidersLifecycleTab.tsx` calls `insiders-cross-links` and groups by raw `creator_wallet` — which is why it says "319 creators" (it's really 319 distinct dev wallets, many of which collapse into the same person once we fuse).

Changes in the existing panel (no new tab, no new page):

- Header becomes truthful: `N fused creators · M wallets · K KYC roots · T tokens`
- Each row in Shared Creator / Shared Funder / Shared KYC Root tabs shows the **fused Creator Profile name** (or alias preview if no display_name) instead of just a wallet hash
- Click a row → side drawer opens showing the full fused profile (wallets list, socials list, token list with verdict pills, merge history)
- New small **search box** at the top of the panel: paste any wallet, X handle, TG ID, or Discord ID → drawer opens for the matching Creator Profile. This is the "mesh query" you described.
- The two action buttons that already live next to "Wallet Cross-Links" (Rescan KYC / Retrace Insiders KYC) stay where they are.

### 5. Backfill

One-time job (`creator-profile-backfill`) walks every existing `telegram_insider_token_lifecycle` row and pushes it through the fuser. After it finishes, every historical token is attached to a Creator Profile and the mesh-search works retroactively.

## Technical notes (skip if not interested)

- New table: `creator_identity_aliases` only. Everything else reuses existing tables.
- Optional new columns on `developer_profiles`: `merged_into uuid` + `merged_at timestamptz` so a merged-away profile becomes a tombstone redirecting to the surviving id.
- `creator_merge_log` (audit table): old_id, new_id, trigger_signal, timestamp.
- All writes go through `assertDbWrite` per the zero-tolerance silent-fails rule.
- `creator-profile-fuser` is idempotent — safe to re-run on the same token.
- X handles always normalize via `x_account_registry` to the immutable numeric ID **before** being stored as an alias, so handle rotation can't fragment a profile.
- Telegram handles likewise normalize to numeric `telegram_user_id` when known; fall back to lowercased handle alias otherwise.
- `creator-profile-lookup` is the single source of truth for the upcoming Bubble Map "Creator card" too — same endpoint will power the mesh-wide identity hover.

## What you'll actually see after this ships

1. The "Wallet Cross-Links" header stops lying — real fused-creator count.
2. Each cross-link row is a **person**, not a wallet hash, with all their tokens listed.
3. A search box right above the panel where you paste a TG ID / X handle / wallet → instant Creator Profile drawer.
4. New rugger pops up under a fresh wallet but reuses his X handle → he's auto-fused into his prior rug history. No manual work.

## What I'm NOT doing

- Not adding a new tab, new page, or new sidebar entry.
- Not rebuilding the Insiders Lifecycle table.
- Not touching the existing Rescan/Retrace buttons.
- Not adding new crons (fuser runs inline on existing pipelines; backfill is one-shot).
