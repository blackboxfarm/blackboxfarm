## Why almost every token shows "SERIAL RUGGER"

It's a **labeling bug + misleading copy**, not because the system actually thinks every dev rugged.

### What I found in the data

The UFO creator wallet (`Aqje5DsN…CFhSMXk`) is recorded as:
- `trust_level = serial_rugger`
- `tokens_rugged = 0`
- `tokens_abandoned = 58`
- `total_tokens_launched = 1020`
- Notes: `Auto-created from backfill: bump_bot_detected:88%_micro_txs, high_bump_bot_ratio`

Across the whole table, `dev_wallet_reputation` has **537 wallets labelled `serial_rugger` — 256 of them (48%) have 0 actual rugs**. They were promoted on `tokens_abandoned` alone (avg 15.9 abandons, avg 31 launches).

### Root cause (in `supabase/functions/_shared/rejection-mesh.ts` lines 94–107)

```ts
const isRug = tags.includes('dev_dump') || tags.includes('pump_and_dump');
if (isRug) updates.tokens_rugged++;
else       updates.tokens_abandoned++;     // bump-bot, low-liquidity, spam, etc.
const totalBad = tokens_rugged + tokens_abandoned;
if (totalBad >= 5) updates.trust_level = 'serial_rugger';
```

So **any 5 rejections of any kind** (bump-bot heuristics, low liq, spam pattern, abandonment) flip the wallet to `serial_rugger`, even with zero rug events. Then `FlipItDashboard.tsx` line 900 renders:

> "🚨 SERIAL RUGGER — **0 rugged tokens on record**. Reputation score: 50/100."

…which is internally contradictory and exactly what you saw.

A second amplifier: `total_tokens_launched` is incremented on every rejection event for the same token, so prolific launchers (Pump.fun bot devs, token factories) hit threshold almost instantly and stay there.

---

## Proposed fix (frontend + small classifier change)

### 1. Fix the misleading copy in `src/components/admin/FlipItDashboard.tsx` (~line 895–906)

Distinguish real rugs from "low-quality launcher":

- If `tokens_rugged >= 3` → keep `🚨 SERIAL RUGGER — N rugs on record` (high)
- Else if `tokens_rugged >= 1` → `⚠️ PRIOR RUG — N rug${s}, M abandoned` (high)
- Else if `tokens_abandoned >= 10` → `⚠️ LOW-QUALITY LAUNCHER — M abandoned tokens, 0 confirmed rugs` (medium, not high)
- Else → no warning (drop to mesh check)

This way the badge truthfully reflects what's in the row instead of forcing the `serial_rugger` enum into "RUGGER" wording.

### 2. Tighten the classifier in `supabase/functions/_shared/rejection-mesh.ts`

Replace the `totalBad >= 5 → serial_rugger` rule with:

```text
rugs   = tokens_rugged
abandon = tokens_abandoned
if rugs >= 5                       → serial_rugger
elif rugs >= 2                     → repeat_rugger    (new tier, or reuse 'scammer')
elif rugs >= 1                     → scammer
elif abandon >= 10                 → low_quality_launcher  (new tier)
elif abandon >= 3                  → repeat_loser
else                               → suspicious
```

`serial_rugger` becomes reserved for actual repeat rug events. Bump-bot/abandonment patterns get their own honest label.

### 3. One-time backfill SQL (migration)

For existing rows: anything currently `serial_rugger` with `tokens_rugged = 0` gets demoted to the new `low_quality_launcher` (or `repeat_loser` if abandons < 10). ~256 wallets re-classified, no data loss.

### 4. Keep the Blacklist Mesh `fail-open` policy intact

Per project memory ("Security Guards Policy"), warnings stay non-blocking. This is purely a **truthfulness of the warning** fix — the buy still proceeds.

---

### Files touched

- `src/components/admin/FlipItDashboard.tsx` — copy + tier mapping (~15 lines)
- `supabase/functions/_shared/rejection-mesh.ts` — classifier ladder (~10 lines)
- new migration: backfill demotion of false-positive `serial_rugger` rows

### Out of scope (call out, don't fix unless you want)

- `total_tokens_launched` being incremented on repeat rejections of the same token (inflates the denominator). Worth fixing but separate change.
- Other call sites that promote to `serial_rugger` (`backcheck-profit-exits`, `pumpfun-fantasy-sell-monitor`) — they already use real rug signals, so they're fine.

---

**Confirm and I'll switch to build mode.** Want me to also fix the `total_tokens_launched` double-counting in the same pass, or leave that for later?