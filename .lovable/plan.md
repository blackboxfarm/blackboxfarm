## Suspension Registry — Plan

### 1. New table `feature_suspensions`
Columns:
- `id` uuid pk
- `feature_key` text (e.g. `token-ai-interpreter`, `intel-xbot-posts`)
- `scope` text (`edge_function` | `frontend_feature` | `cron` | `bot_command` | `other`)
- `reason` text — your stated reason
- `notes` text nullable — extra context
- `suspended_at` timestamptz default now()
- `suspended_by` uuid nullable (auth uid)
- `lifted_at` timestamptz nullable
- `lifted_by` uuid nullable
- `status` text generated: `'active'` if `lifted_at IS NULL` else `'lifted'`
- `related_toggle_table` text nullable (e.g. `function_toggles`, `intelligence_feature_flags`)
- `related_toggle_key` text nullable (the row identifier to flip back on)

RLS: super_admin only (read/insert/update).

### 2. New admin UI tab: **Suspensions** (under Utilities tab as a sub-section to avoid tab sprawl)
Two panes:
- **Active suspensions** — cards showing feature_key, reason, when, who; `Re-enable` button (which (a) marks `lifted_at`, (b) if `related_toggle_table` is set, flips that toggle back on automatically).
- **History** — collapsed list of lifted suspensions, sortable by date.
- **Add manual suspension** — small form for ad-hoc entries (so you can log anything I suspend in edge function code directly).

### 3. Workflow going forward
Whenever you ask me to suspend something, I will:
1. Make the code/toggle change.
2. INSERT into `feature_suspensions` with feature_key + reason + related_toggle pointer.
3. Confirm "Logged in Suspensions registry."

Re-enabling from the UI auto-flips the underlying toggle when possible; otherwise it just marks lifted and tells you which code path needs reverting.

### 4. Files
- Migration: create table + RLS + indexes on `(status, suspended_at desc)`.
- `src/components/admin/SuspensionsPanel.tsx` (new).
- Wire into `UtilitiesTab.tsx` as a section (or new top-level tab if you prefer — say the word).

Awaiting **Plan Approved**.