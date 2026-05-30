## Problem

Right now `no-lube-orchestrate` will process **any** lifecycle row the safety-sweep cron hands it, regardless of when the token was first called by Insiders. That means:

- 6 Leaks just posted to Public in the last 3 minutes for old backlog tokens (zinc…, Ehvs…, ahkw…, 23Y1…, 7bK4…, 4TWm…).
- Dead 2000+ min tokens (`9p7hL1F7…`, `25t3wviw…`, `6nQNtHjph…`, `3K5Ct5wn…`) keep getting re-attempted as `big_picture` composes — the terminal-dead guard needs 3 dead rows in a row, but each safety-sweep run keeps creating fresh attempts before that threshold trips.

## Fix: hard backlog cutoff

At the very top of `no-lube-orchestrate/index.ts`, immediately after we load the lifecycle row, add one check:

```ts
const BACKLOG_MAX_AGE_MIN = 30; // ignore anything older than 30 min from first_called_at
const calledAt = lcRow?.first_called_at ? new Date(lcRow.first_called_at).getTime() : null;
const ageMin = calledAt ? (Date.now() - calledAt) / 60000 : null;
if (ageMin != null && ageMin > BACKLOG_MAX_AGE_MIN) {
  return jsonResp({
    ok: true, flow: 'skipped', skipped: true,
    reason: 'backlog_ignored',
    first_called_at: lcRow.first_called_at,
    age_minutes: Math.round(ageMin),
  });
}
```

This single gate stops **every** downstream path — snapshot, big_picture, Leaks fork, and re-sighting probes — before they cost any DexScreener / Helius / Telegram calls. Nothing else changes.

### Why 30 minutes

- Insiders-row-ingest fires within seconds via the postgres trigger.
- The 2-min safety-sweep cron catches anything the trigger missed within a few minutes.
- 30 min is a comfortable buffer for genuinely fresh tokens but cleanly excludes the 2000-min-old dead carcasses the sweep keeps re-touching.

### Configurable

Store the cutoff on `no_lube_global_profile` as `backlog_max_age_min` (numeric, default 30) so you can tune it from the admin UI later without redeploying. Read it once alongside `multiplier_threshold` / `leaks_min_mcap`.

## Files touched

- `supabase/functions/no-lube-orchestrate/index.ts` — add the gate + read new config column.
- One migration adding `no_lube_global_profile.backlog_max_age_min numeric NOT NULL DEFAULT 30`.

## Out of scope

- No template / push / compose changes.
- No DB cleanup of old pending rows — the gate just makes orchestrate ignore them; they sit quietly in `telegram_insider_token_lifecycle` doing nothing.
- No change to the dead-token 3-strike rule (becomes moot because backlog never reaches it).

Reply **Plan Approved** to implement.