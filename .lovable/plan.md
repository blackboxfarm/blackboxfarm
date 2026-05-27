## What I found

- The system is not stuck in Telegram itself; it is repeatedly invoking `no-lube-orchestrate` for the same already-qualified GOSLINGS mint.
- `no_lube_post_log` shows GOSLINGS posted dozens of times in minutes at the same ~2.1x–2.2x range.
- The current re-sighting logic posts every time `current_mcap / first_seen_mcap >= 2.0`, but it does **not** require a new higher milestone than the last one already posted.
- There is also a backlog of `blackbox_aggregator_runs` still sitting in `harvesting`, so old runs can keep getting harvested and handed off again instead of cleanly aging out.
- The image renderer is being called with only `mint` and `multiplier`, while `no-lube-render-card` currently expects `mint`, `ticker`, and `multiplier`; that is causing repeated `render-card failed, posting text-only` warnings, but it is not the main duplicate-post root cause.

## Fix plan

1. **Add milestone de-dupe in `no-lube-orchestrate`**
   - Calculate the current multiplier from first-seen market cap as now.
   - Before posting, read the last posted multiplier for that token.
   - Only post when the token crosses a new material X milestone, not every time it is merely still above 2x.
   - Example behavior:
     - first seen 363k → 771k = 2.1x: post once as 2x/2.1x
     - 771k → 791k while still 2.2x: skip
     - later reaches 3.0x: post again
     - later reaches 4.0x: post again

2. **Use a stable milestone label**
   - Store/compare a milestone floor such as `2`, `3`, `4`, etc. so a token cannot spam `2.1x`, `2.2x`, `2.1x` repeatedly.
   - Keep the display multiplier available for the message, but the posting gate will be milestone-based.

3. **Fix the rendered-card call**
   - Pass the ticker into `no-lube-render-card`, or make the renderer resolve ticker internally.
   - This removes the `mint, ticker, multiplier required` warning and restores image cards.

4. **Prevent stale harvest backlog from re-triggering posts**
   - In `blackbox-tick`, if a harvesting run has no matching bot replies, mark it as completed/failed/stale instead of leaving it in `harvesting` forever.
   - This keeps the queue moving to new tokens instead of repeatedly revisiting old eligible runs.

5. **Validate after changes**
   - Deploy the touched edge functions.
   - Query recent `no_lube_post_log` rows to confirm GOSLINGS stops reposting at the same milestone.
   - Confirm new tokens are still first-sighting to private, and public only fires once a new X milestone is crossed.

## Files to change after approval

- `supabase/functions/no-lube-orchestrate/index.ts`
- `supabase/functions/blackbox-tick/index.ts`
- possibly `supabase/functions/no-lube-render-card/index.ts` if ticker should be resolved inside the renderer instead of passed by orchestrate