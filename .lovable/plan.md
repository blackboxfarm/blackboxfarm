
## What the 10-min cron actually does

Right now we have **two paths** that score communities, and they overlap:

1. **Event-driven (mesh-ingest)** — every public CA query on `/holders`, `/bubblemap`, or any Telegram bot lookup calls `community-recycled-scorer` in `evaluate_for_token` mode. This re-scores every community linked to that mint. **This is the live path and it's already correct.**

2. **The 10-min cron** — calls the same function in `evaluate_recent` mode. It pulls up to 50 communities whose `x_communities.updated_at` was bumped in the last 24h and re-scores each one. No event awareness, no priority — just "look at recently-touched rows."

You're right to question it. The cron is a **lazy safety net** that exists because:
- Some signals change without anyone querying the token (e.g. an X-community scraper bumps member count, a token in the community's history rugs an hour later, a community gets renamed).
- We didn't have event hooks at those exact moments, so the cron bulk-rescores anything whose `updated_at` moved.

The cost is small (50 rows × 10 min) but you're right that it's the wrong shape. Recycled-band scoring should be **fully event-driven**, because every signal that feeds it is itself an event:

| Signal | True trigger event | Currently captured? |
|---|---|---|
| Community age vs token age | Token mint appears | ✅ mesh-ingest fires on CA query |
| Name-history length | X scraper writes new `name_history[]` row | ❌ No hook |
| Member-to-holder ratio | X scraper bumps `member_count` OR holders sweep updates | ❌ No hook |
| Prior-token rug rate | A linked token flips `is_rugged=true` or autopsy lands | ❌ No hook |
| Serial-dev-admin overlap | New token mint maps community → known scammer dev | ⚠️ Partial (only on lookup) |
| Rename frequency | X scraper bumps `name_history[]` | ❌ Same as above |

So the cron exists to paper over those four ❌ holes.

---

## Plan — kill the cron, wire real events

This is the structural fix. On approval I'll execute:

### 1. Hook the X-community scraper
After the X scraper writes an `x_communities` row (name change, member-count update, new linked mint), fire-and-forget call to `community-recycled-scorer` with `{ mode: 'evaluate', community_id }`. This catches rename + member-bloat + linked-token signals at their actual moment of change.

**Files:** whichever function writes to `x_communities` (likely `backfill-x-communities` and the universal mesh feeder — I'll grep before patching).

### 2. Hook the rug/death events
When a token flips to `is_rugged=true` or gets an autopsy entry, look up its linked communities and re-score each one. A rug is the most informative signal — a community's "prior rug rate" just changed and we want the badge to flip in real time, not 10 minutes later.

**Files:** `insiders-lifecycle-builder`, `token-autopsy-engine`, or whichever writer flips `is_rugged`.

### 3. Keep the on-mint hook
Already done via mesh-ingest → `evaluate_for_token`. No change needed; this is the "Check on mint" you mentioned. ✅

### 4. Add a DEX-paid hook
When `token_social_links.dex_paid_at` flips from null → timestamp (lifecycle phase shift you mentioned), the dev-quality signal changes. Fire `evaluate_for_token`. **Files:** `dex-paid-checker`.

### 5. Replace the cron with a sparse safety-net
Don't fully delete it — keep ONE cron at **6 hours** that only re-scores communities whose `recycled_evaluated_at` is older than 7 days AND whose `updated_at` is fresh. This catches edge cases where signals drift without an event (rare). Cheaper, less noisy, and clearly a fallback rather than the primary path.

### 6. Update memory
Save a constraint memory: *"Recycled community scoring is event-driven (mint, DEX paid, rug, scraper write, rename). 6h cron is a fallback only, not the source of truth."*

---

## What you'll actually see

- Badges flip the moment the underlying signal moves, not on a 10-min tick.
- Cron noise drops ~95%.
- The four ❌ holes in the table above all become ✅.

Want me to ship steps 1–5 in one pass, or do you want to start with just steps 1–2 (scraper + rug hooks) and validate before adding the rest?
