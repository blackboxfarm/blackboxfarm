---
name: HoldersIntel Token Archive
description: Super-admin Token Archive page renders every posted Manual X post in @HoldersIntel X-card style, sourced from structured columns persisted at compose time
type: feature
---

Pipeline:
1. `holders-intel-compose-preview` persists the FULL structured payload on every compose call (not just `tweet_text`): tweet_composed_at, ai_snippet, health_grade/score/label, real_holders, total_wallets, whales/serious/retail/dust counts, dust_pct, snapshot_label, hashtags_line, banner_used_url, posted_handle.
2. Super-Admin → HoldersIntel → **📚 Token Archive** (sub-tab `token-archive`) renders these via `HoldersIntelTweetCard`. Newest first by `manual_posted_at`. Page sizes 50/100/250/500, search by mint/symbol/name, trigger_source filter, full pagination.
3. Manual X Posting Queue (`ManualXPostingQueue.tsx`) no longer hard-caps at 50 — uses `count: exact` + range pagination + search.
4. Archive filter: `manual_status = 'posted_manual'` only.
5. Fallback: if structured columns are null on a row, card renders raw `tweet_text` inside same chrome.

Started clean: historical pre-compose rows are NOT backfilled; archive populates organically going forward.
