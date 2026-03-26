

# Social URL Lifecycle: Launchpad → DEX Paid → CTO

## Current State

You have **three separate systems** that don't talk to each other well:

| System | What it captures | Gap |
|--------|-----------------|-----|
| `token_social_links` | Every URL found during backfill, tagged by source | No lifecycle phase, no "current vs historical" flag |
| `token_socials_history` | Snapshots of twitter/telegram/website when dex-paid-checker runs | Only fires on DEX paid tokens, only 4 fields, no source URLs beyond socials |
| `useCTODetection` | Compares earliest vs latest snapshot in `token_socials_history` | Misses intermediate changes, doesn't know which phase each snapshot belongs to |

**Key problems:**
1. `token_social_links` stores discovery-time URLs but has no concept of "this was replaced later" — it just accumulates rows
2. `token_socials_history` only snapshots when `dex-paid-checker` runs on paid tokens — misses launchpad-phase socials entirely
3. No lifecycle phase marker (`launchpad`, `dex_paid`, `cto`) on any record
4. Bubble map has no way to show "socials changed from Phase A to Phase B"

## Plan

### Step 1: Add lifecycle phase to `token_socials_history`

Add a `phase` column to track which stage the snapshot was captured during:

```sql
ALTER TABLE token_socials_history 
  ADD COLUMN phase text DEFAULT 'unknown'; -- launchpad, dex_paid, cto, manual
```

This is the key missing piece. Each snapshot row now says "these were the socials during X phase."

### Step 2: Add `is_current` flag to `token_social_links`

```sql
ALTER TABLE token_social_links 
  ADD COLUMN is_current boolean DEFAULT true,
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN phase text DEFAULT 'discovery';
```

When a new set of socials arrives from a different phase, mark old links as `is_current = false` with a `superseded_at` timestamp. This gives the bubble map a clean "current socials" query while preserving history.

### Step 3: Update `backfill-x-communities` to snapshot phase

When the backfill discovers socials from DexScreener/Pump.fun/Solscan, insert into `token_socials_history` with `phase = 'launchpad'` (if token not yet bonded) or `phase = 'dex_paid'` (if bonded and DEX paid).

### Step 4: Update `dex-paid-checker` snapshot logic

The existing `snapshotSocialsIfChanged` function gets a phase parameter:
- If `hasCTO` is true → `phase = 'cto'`
- If `hasPaidProfile` and no CTO → `phase = 'dex_paid'`
- Otherwise → `phase = 'launchpad'`

When inserting a new snapshot, also mark previous `token_social_links` rows for that token as `is_current = false`.

### Step 5: Update CTO detection to use phases

`useCTODetection` currently compares earliest vs latest snapshot blindly. Upgrade to:
- Compare the last `dex_paid` phase snapshot against the first `cto` phase snapshot
- This eliminates false positives from normal launchpad-to-paid transitions

### Step 6: Bubble map social timeline

Add a small timeline indicator on the token node or in the details panel showing:
```text
Phase 1 (Launchpad): @token_dev, t.me/tokengroup
Phase 2 (DEX Paid):  @token_official, t.me/tokenofficial, website.com
Phase 3 (CTO):       @new_community, t.me/newgroup
```

This uses a simple query: `SELECT * FROM token_socials_history WHERE token_mint = ? ORDER BY captured_at` grouped by `phase`.

## Technical Details

- Migration adds 3 columns across 2 tables (lightweight)
- `dex-paid-checker` changes: ~10 lines to pass phase to `snapshotSocialsIfChanged`
- `backfill-x-communities` changes: ~15 lines to insert history snapshots with phase
- `useCTODetection` changes: ~20 lines to compare by phase instead of by position
- Bubble map UI: new `SocialTimeline` component (~60 lines) in the details panel
- All existing data gets `phase = 'unknown'` which is safe — it just means "captured before we tracked phases"

