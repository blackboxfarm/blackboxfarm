# 🚀 Two Things, One Approval

## Part 1 — Stop waiting, just retrace it now

You're right, the 3-hour cron is silly when we can fire the scan on demand.

**Action:** Invoke `wallet-genealogy-scanner` immediately against the `Honestrug` creator (`3H7P1ru6aaMcXKvWNVpau1WdRjYsR7HZZ6puKaeXhxtP`) with `depth=20, branch=1`. Returns the full ladder live, persists to `reputation_mesh` + `dev_wallet_reputation`, and we read the KYC root straight out of the response.

**If the right token was actually a different `$HONESTSHRUG` mint**, paste the CA and I'll target that one instead. (DB has `Honestrug`, `HONESTRUG`, and `Shruggie` variants — best guess is the first.)

No code change needed for this — it's just a one-shot tool call.

---

## Part 2 — Surface the collaboration / "dev family" mesh (the real prize)

### What I found

Querying `reputation_mesh` right now returns this *already-collected* gold:

| Funder Wallet (truncated) | Distinct creators it bankrolled |
|---|---|
| `14cT4K…oF9y` | **46** |
| `5ndLnE…HEPs` | **45** |
| `H8HBLH…NN3U` | **44** |
| `7BwHJR…KTXY` | **44** |
| `FopmrH…nUUb` | **43** |
| `8QCVZ7…RNn5` | **36** |
| ...20+ more | 20–35 each |

These are **mid-fanout funders** (3–50 downstream wallets) — too small to be CEX hot wallets, too big to be coincidence. **This is the collaboration signal you're asking about.** When the same funder seeds 30 different "creator" wallets, that's one operator running a multi-mint farm.

(Separately: the top-1 funder hit 1,737 creators — that's almost certainly an unlabelled CEX hot wallet that needs to be added to `cex-wallets.ts` so we stop walking through it. I'll tag it in the same pass.)

### Three small additions

**A. `mesh-shared-funders` edge function** *(new, ~80 lines)*
- Input: `{ wallet }` — any creator wallet
- Walks its `genealogy_chain` (already stored), then for each intermediate wallet, queries `reputation_mesh` for sibling downstream wallets ("who else did this funder seed?")
- Returns:
```json
{
  "creator": "3H7P1...",
  "shared_funders": [
    {
      "funder": "5ndLnE...",
      "depth_in_chain": 4,
      "siblings_count": 45,
      "sibling_creators": ["...", "...", "..."],
      "sibling_tokens": [{ "mint": "...", "symbol": "FOO", "peak_multiplier": 12.3 }],
      "cluster_label": "likely_dev_family"
    }
  ]
}
```

**B. `<SharedFundersPanel />` UI component** *(new)*
- Drop into the existing Bubblemap / Holders Report sidebar
- Renders each shared funder as a collapsible card showing the sibling tokens (with their peak multipliers — so you instantly see "this farmer's other mints did 50x")
- Click a sibling token → deep-link to its bubble map

**C. Auto-flag known false-positive CEX hot wallets**
- Add the top funder (1,737 fanout) to `cex-wallets.ts` after a quick Solscan label check, so future traces stop at it instead of polluting the cluster data with thousands of unrelated creators.

### What I will NOT touch

- `auto-genealogy.ts` core logic (just shipped, leaving alone)
- The 3-hour backfill cron (orthogonal)
- `insiders-cross-links` (different surface, different audience)

---

## TL;DR
1. Retrace `Honestrug` right now to prove the new linear walker hits Binance.
2. Build a tiny "shared funder" lens over the mesh data we're *already* collecting — turns the genealogy graph into a collaboration detector.
3. Patch one suspect CEX wallet so it stops eating the cluster signal.

Approve and I'll ship all three in one pass.
