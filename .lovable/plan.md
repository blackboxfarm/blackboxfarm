## What broke

The bot itself is replying now, but it is replying with the fallback stub because `bagless-holders-report` is failing before it can build the full holder snapshot.

Current failure signal:

```text
bagless-holders-report error (500): {"error":"All RPC endpoints failed."}
```

The old working replies had full holder fields because `bagless-holders-report` successfully returned token accounts. The newest replies die because the function now depends on `getProgramAccounts` across RPC endpoints, and all current endpoints are returning empty/error for that call. The fallback I added kept the bot visible, but it did not fix the holder data source.

## Repair plan

1. **Fix the real holder snapshot path in `bagless-holders-report`**
   - Replace the fragile `getProgramAccounts`-only holder fetch with a Helius-first holder fetch path using the configured `HELIUS_API_KEY`.
   - Use a token-owner/token-account endpoint that is meant for full holder discovery instead of relying on public RPCs that often block or omit `getProgramAccounts`.
   - Keep the existing RPC fallback only as secondary backup.

2. **Add useful failure logging**
   - Log which provider failed and why: Helius status/body snippet, public RPC status/error, timeout.
   - Stop producing blank `All RPC endpoints failed.` errors with no underlying reason.

3. **Restore old-style BlackBox bot output when holder data exists**
   - Keep the current full report formatting path intact: holders count, health, top 10, distribution bars, full report link, BubbleMap link.
   - Only use the “snapshot temporarily unavailable” stub when the Helius holder endpoint and every backup source truly fail.

4. **Deploy and verify**
   - Deploy `bagless-holders-report` and `holdersintel-bot-webhook` if needed.
   - Test one recent BlackBox mint directly against `bagless-holders-report`.
   - Confirm logs show holder fetch success and the bot can return a full holder snapshot again.

## Technical notes

- No UI changes.
- No database migration expected.
- No new paid service expected; this uses the existing Helius key already present in logs.
- The fallback reply stays as a safety net, but it should no longer be the normal path.

## Approval needed

Say **Plan Approved** and I’ll implement this directly.