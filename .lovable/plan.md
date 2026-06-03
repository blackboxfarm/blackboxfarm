## Why the bot is silent

The webhook IS firing in BlackBox group (`-1003739469076`) and entering the passive auto-scan path correctly. Logs show:

```
[bot] blackbox_group passive auto-scan chat:-1003739469076 ca:Fyc2fmukseRM
[bot] bagless-holders-report error (500): {"error":"All RPC endpoints failed. "}
```

In `handleGroupAutoScan` (line ~3023), when `bagless-holders-report` errors, the function does `return; // silently fail` — so HoldersIntel never sends a reply. The bot's own self-diagnosis (privacy mode / regex / is_ca_only) was a hallucination; the real cause is the Helius/RPC fan-out returning 500 and the handler bailing without a fallback.

## Fix

### 1. Root cause: `bagless-holders-report` RPC failure
- Inspect the RPC endpoint list / credit state in `bagless-holders-report` and verify Helius `HELIUS_API_KEY` is loaded and not exhausted.
- Add one retry with 500 ms backoff across the existing RPC fallback chain before returning 500.

### 2. Never go silent in BlackBox group (`handleGroupAutoScan`)
Replace the `if (!holdersData || holdersData.error) return;` early-exit with a tiered fallback used **only when invoked with `skipActivationCheck` (i.e. the BlackBox aggregator path)**:

1. If `bagless-holders-report` fails, try `holders-intel-compose-preview` / DexScreener-only data we already cache (symbol, MC, liq, holders if available).
2. If that also fails, post a minimal stub:
   ```
   ⚡ {TICKER or short CA} — quick stats temporarily unavailable
   🔗 [Full Report] | [BubbleMap]
   ```
   so Phanes / Rick / HoldersIntel all line up in the thread and the operator can see the bot is alive.
3. Log the failure to `holders_intel_seen_tokens` / existing flow log so it surfaces in the Steps Log panel.

Customer-installed groups (no `skipActivationCheck`) keep current silent-fail behaviour — we don't want to spam paying installs with stubs.

### 3. Verification
- Re-deploy `holdersintel-bot-webhook` and `bagless-holders-report`.
- Trigger the BlackBox tick (or paste a CA in the group) and confirm a HoldersIntel reply appears, plus a log line `[bot] blackbox_group reply sent (full|fallback|stub)`.

## Out of scope
- BotFather privacy mode / regex changes — not the actual cause.
- Any change to customer-install (`channel_installations`) silent-fail behaviour.
- MTProto reply-scrape pipeline.