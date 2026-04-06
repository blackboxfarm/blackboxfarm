

## Fix: Config System is Broken in Two Ways

### Problem 1: Hardcoded 3-second delay
Line 2060 of the webhook has `setTimeout(resolve, 3000)` — it ignores whatever the admin sets via `/config delay`. The delay should be read from the channel's `admin_config.delay_ms` in the database.

### Problem 2: `/config select` forgets immediately
`userSelectedChannel` is a JavaScript `Map()` stored in memory (line 2204). Edge functions are **stateless** — each incoming message spins up a fresh instance. So when you do `/config select -1003739469076`, it stores the selection in RAM, responds "Selected: BLACKBOX", and then the function exits. The next message (`/config delay 2500`) hits a **new instance** with an empty Map, so it says "No channel selected."

This is why the screenshots show the selection working but every subsequent config command failing.

### Problem 3: New installations default to 0ms delay
The upsert at line 2763 doesn't include `admin_config`, so the DB column default applies — which is `{delay_ms: 0}` instead of `{delay_ms: 3000}`.

---

### Plan

**1. Persist channel selection in the database instead of in-memory**
- Add a `selected_channel_id` column to `telegram_linked_accounts` (or a small new table)
- `/config select` writes the selection to the DB
- All subsequent `/config` commands read it from the DB
- This survives across function invocations

**2. Read delay from `admin_config` in `handleGroupAutoScan`**
- Replace the hardcoded `setTimeout(resolve, 3000)` with a DB lookup of the installation's `admin_config.delay_ms`
- Fallback to 3000ms if no config exists

**3. Set proper defaults on installation upsert**
- Add `admin_config: { delay_ms: 3000, verbose: false, admin_only_commands: false, dev_wallet_alerts: false }` to the upsert payload at line 2763

**4. Migration: fix DB defaults + backfill**
- Change the column default for `admin_config` to `{delay_ms: 3000, ...}`
- Backfill all existing installations that have `delay_ms: 0` to `3000`

**5. Auto-select when user has only one channel**
- If the user runs `/config delay 2500` and has exactly one installation, auto-select it instead of demanding `/config select` first — quality-of-life improvement

**6. Redeploy the webhook**

### Technical Detail

| File | Change |
|------|--------|
| Migration SQL | Add `selected_channel_id` to `telegram_linked_accounts`, fix `admin_config` default, backfill |
| `holdersintel-bot-webhook/index.ts` line 2204 | Remove in-memory Map, replace with DB read/write for selection |
| `holdersintel-bot-webhook/index.ts` line 2060 | Read `admin_config.delay_ms` from DB instead of hardcoded 3000 |
| `holdersintel-bot-webhook/index.ts` line 2763 | Add default `admin_config` to upsert payload |
| `holdersintel-bot-webhook/index.ts` handleConfig | Auto-select if user has exactly 1 channel |

