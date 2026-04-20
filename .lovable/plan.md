

## Plan — Function Toggle System (function-level only, cron-driven)

Build a runtime kill switch for the ~30 cron-driven edge functions. Toggle from the existing Function Table view. No source rewriting, no cron unscheduling — just a clean early-return guard.

### What gets built

**1. New table: `function_toggles`**
| column | type | notes |
|---|---|---|
| `function_name` | text PK | matches edge function name |
| `enabled` | boolean default true | the switch |
| `disabled_reason` | text | optional note |
| `disabled_at` | timestamptz | audit |
| `disabled_by` | uuid | super_admin user id |
| `last_skipped_at` | timestamptz | updated when guard fires |
| `skip_count_24h` | int default 0 | reset daily |

RLS: super-admin read/write only. Anon read of `enabled` field allowed (so the guard works without auth overhead).

**2. Shared guard: `supabase/functions/_shared/function-toggle.ts`**
```typescript
export async function isFunctionEnabled(name: string): Promise<boolean>
```
- 60-second in-memory cache per function instance
- Default to `true` if table row missing or DB unreachable (fail-open — never break a job because the toggle table is down)
- On `false`, increments `skip_count_24h` and updates `last_skipped_at`

**3. Guard added to ~30 cron-driven functions** (3 lines at top of each):
```typescript
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
if (!await isFunctionEnabled('function-name-here')) {
  return new Response(JSON.stringify({ skipped: 'disabled' }), { status: 200 });
}
```

Functions covered (the cron-driven ones from the audit):
- HoldersIntel core: `holdersintel-orchestrator`, `holders-intel-poster`, `holders-intel-dex-scanner`, `dex-top-200`, `funnel-feed-scanner`, `feed-health-scanner`, `harvest-token-socials-backfill`, `ath-24h-backfill`, `morning-report`, `phanes-x-backfill`, `hunter-tweet-scrape`, `daily-twitter-profile-refresh`
- Oracle/forensics: `oracle-hourly-scan`, `oracle-auto-classifier`, `oracle-historical-backfill`, `family-discovery-engine`, `family-mint-monitor-p1`, `family-mint-monitor-all`, `dev-behavior-scorer`, `developer-integrity`, `developer-wallet-rescan`, `audit-creator-integrity`, `allstar-promotion-engine`, `co-mint-cluster-detector`, `token-fingerprint-scanner`, `token-autopsy`, `backfill-genealogy-drip`, `backfill-x-communities`, `mesh-backfill`, `refresh-mesh-summary`
- Telegram: `telegram-channel-monitor`
- Trading: `trading-orchestrator`, `pumpfun-orchestrator`, `backcheck-stop-loss`, `backcheck-rejected`
- Email/lifecycle: `process-reactivation-emails`, `prune-pending-reactivation-emails`, `prune-email-tracking-events`, `auto-suspend-unverified-7d`, `sol-renewal-reminder`
- Maintenance: `database-housekeeping`, `prune-dex-scrape-log`, `system-health-audit`, `kol-registry-sync`, `daily-kol-leaderboard-refresh`, `channel-pair-analyzer`

**4. UI integration in the existing Function Table view**
Find the table currently shown on the SuperAdmin screenshot and add:
- A new **"Enabled"** column with an inline shadcn `Switch` per row
- Click toggle → opens small popover for optional "reason" → writes to `function_toggles`
- Visual: disabled rows get muted opacity + "DISABLED" badge
- Hover tooltip shows `disabled_reason` + `disabled_at` + skip count

### What the user sees

```text
┌────────────────────────────────┬──────┬─────┬────────┬─────────┐
│ Function                       │ Runs │ Err │ Avg ms │ Enabled │
├────────────────────────────────┼──────┼─────┼────────┼─────────┤
│ telegram-channel-monitor       │  979 │  20 │  3695  │   ◉ ON  │
│ phanes-x-backfill              │   45 │   0 │  2100  │   ◉ ON  │
│ holdersintel-surge-scanner     │    0 │   0 │    -   │   ○ OFF │ ← greyed
└────────────────────────────────┴──────┴─────┴────────┴─────────┘
```

### Behavior notes

- **Cron keeps firing** when off — function exits in ~50ms (negligible)
- **Fail-open**: if `function_toggles` query fails, function runs normally. Never block jobs because of toggle infrastructure.
- **Audit trail**: every flip logs to `admin_notifications` (who, when, what, why)
- **No source mutation, no redeploys, instant on/off**
- **Sub-feature toggles**: same table supports them later via `feature_name` column if you ever want one — added by hand only when you ask

### Out of scope (explicitly NOT building)

- Auto-detection or auto-commenting of internal function calls
- Source rewriting from the UI
- Toggling the ~110 non-cron edge functions (user-facing API endpoints, webhooks, etc.) — they'd add unnecessary DB checks to every request

### Files

**New:**
- `supabase/functions/_shared/function-toggle.ts`
- `src/components/admin/function-table/FunctionEnabledToggle.tsx`
- migration: create `function_toggles` table + RLS

**Modified:**
- The existing Function Table component in SuperAdmin (add Enabled column)
- ~30 edge functions (3-line guard added at top of each)

